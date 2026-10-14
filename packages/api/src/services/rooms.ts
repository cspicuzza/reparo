import { and, asc, eq, isNull, jobRooms, jobs, ne, phases, rooms, sql, type Db } from '@reparo/db';
import type { RoomCreate, RoomUpdate } from '@reparo/shared';
import { conflict, isUniqueViolation, notFound } from './errors';

const live = () => isNull(rooms.deletedAt);

export function listRooms(db: Db) {
  return db.select().from(rooms).where(live()).orderBy(asc(rooms.sortOrder), asc(rooms.name));
}

export async function getRoom(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), live()));
  if (!row) throw notFound('Room');
  return row;
}

export type RoomProgress = {
  /** Jobs done in this room (its status there is Completed). */
  done: number;
  /** Jobs counted: every live job covering the room, except where it's Cancelled here. */
  total: number;
};

/**
 * How far along rooms are, for the room page ("2 of 4 jobs done") and Home's room tiles. Same
 * counting rule as the jobs roll-up: Cancelled doesn't count; jobs in deleted phases and removed
 * jobs don't either. `awaitingReview` counts the jobs waiting for someone to check them there.
 * Rooms with no counted jobs are absent from the map.
 */
export async function roomsProgress(
  db: Db,
  roomId?: string,
): Promise<Map<string, RoomProgress & { awaitingReview: number }>> {
  const conds = [
    isNull(jobRooms.deletedAt),
    isNull(jobs.deletedAt),
    isNull(phases.deletedAt),
    ne(jobRooms.status, 'cancelled'),
  ];
  if (roomId !== undefined) conds.push(eq(jobRooms.roomId, roomId));
  const rows = await db
    .select({
      roomId: jobRooms.roomId,
      done: sql<number>`count(*) filter (where ${jobRooms.status} = 'completed')`.mapWith(Number),
      awaitingReview:
        sql<number>`count(*) filter (where ${jobRooms.status} = 'awaiting_review')`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(jobRooms)
    .innerJoin(jobs, eq(jobs.id, jobRooms.jobId))
    .innerJoin(phases, eq(phases.id, jobs.phaseId))
    .where(and(...conds))
    .groupBy(jobRooms.roomId);
  return new Map(rows.map(({ roomId: id, ...p }) => [id, p]));
}

export async function roomProgress(db: Db, roomId: string): Promise<RoomProgress> {
  const p = (await roomsProgress(db, roomId)).get(roomId);
  return { done: p?.done ?? 0, total: p?.total ?? 0 };
}

/** A room with its progress, for the room page. */
export async function getRoomWithProgress(db: Db, id: string) {
  const room = await getRoom(db, id);
  return { ...room, progress: await roomProgress(db, id) };
}

export async function createRoom(db: Db, input: RoomCreate) {
  try {
    const [row] = await db.insert(rooms).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'rooms_name_live_uidx')) {
      throw conflict(`A room named "${input.name}" already exists`);
    }
    throw e;
  }
}

export async function updateRoom(db: Db, { id, ...patch }: RoomUpdate) {
  await getRoom(db, id);
  try {
    const [row] = await db
      .update(rooms)
      .set(patch)
      .where(and(eq(rooms.id, id), live()))
      .returning();
    if (!row) throw notFound('Room');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'rooms_name_live_uidx')) {
      throw conflict(`A room named "${patch.name ?? ''}" already exists`);
    }
    throw e;
  }
}

/** Soft-delete. The jobs covering the room keep their rows; the room is hidden from them. */
export async function removeRoom(db: Db, id: string) {
  await getRoom(db, id);
  await db.update(rooms).set({ deletedAt: new Date() }).where(eq(rooms.id, id));
  return { id };
}
