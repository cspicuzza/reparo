import {
  and,
  asc,
  eq,
  isNull,
  jobRooms,
  jobs,
  ne,
  phases,
  rooms,
  shoppingLines,
  sql,
  type Db,
} from '@reparo/db';
import type { Move, RoomCreate, RoomUpdate } from '@reparo/shared';
import { moved } from './order';
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
 * jobs don't either. `awaitingReview` counts the jobs waiting for someone to check them there,
 * `underway` the ones in progress there (Home's order, OD-116).
 * Rooms with no counted jobs are absent from the map.
 */
export async function roomsProgress(
  db: Db,
  roomId?: string,
): Promise<Map<string, RoomProgress & { awaitingReview: number; underway: number }>> {
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
      underway: sql<number>`count(*) filter (where ${jobRooms.status} = 'in_progress')`.mapWith(
        Number,
      ),
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

/** Every room with its progress, for the Rooms list. */
export async function listRoomsWithProgress(db: Db) {
  const all = await listRooms(db);
  const progress = await roomsProgress(db);
  return all.map((r) => {
    const p = progress.get(r.id);
    return { ...r, progress: { done: p?.done ?? 0, total: p?.total ?? 0 } };
  });
}

export type RoomAttachments = {
  /** Live shopping lines (in live phases) for this room. */
  lines: number;
  /** Live jobs (in live phases) that cover this room, whatever its status there. */
  jobs: number;
};

/**
 * What still points at a room (OD-113, Q142). A room with any of these can't be removed: its
 * lines would point at a room nobody can see, and its jobs would quietly lose it.
 */
export async function roomAttachments(db: Db, id: string): Promise<RoomAttachments> {
  const [lines] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(shoppingLines)
    .innerJoin(phases, eq(phases.id, shoppingLines.phaseId))
    .where(
      and(eq(shoppingLines.roomId, id), isNull(shoppingLines.deletedAt), isNull(phases.deletedAt)),
    );
  const [covering] = await db
    .select({ n: sql<number>`count(distinct ${jobs.id})`.mapWith(Number) })
    .from(jobRooms)
    .innerJoin(jobs, eq(jobs.id, jobRooms.jobId))
    .innerJoin(phases, eq(phases.id, jobs.phaseId))
    .where(
      and(
        eq(jobRooms.roomId, id),
        isNull(jobRooms.deletedAt),
        isNull(jobs.deletedAt),
        isNull(phases.deletedAt),
      ),
    );
  return { lines: lines?.n ?? 0, jobs: covering?.n ?? 0 };
}

/** "11 things on the list and 1 job": what a room still has, for the refusal (Q142). */
export function attachmentsText({ lines, jobs: jobCount }: RoomAttachments): string {
  const parts: string[] = [];
  if (lines > 0) parts.push(`${lines} ${lines === 1 ? 'thing' : 'things'} on the list`);
  if (jobCount > 0) parts.push(`${jobCount} ${jobCount === 1 ? 'job' : 'jobs'}`);
  return parts.join(' and ');
}

/** A room with its progress and what's attached to it, for the room page. */
export async function getRoomWithProgress(db: Db, id: string) {
  const room = await getRoom(db, id);
  return {
    ...room,
    progress: await roomProgress(db, id),
    attached: await roomAttachments(db, id),
  };
}

export async function createRoom(db: Db, input: RoomCreate) {
  try {
    // A new room goes after the last one unless it says otherwise (OD-117, Q141).
    const sortOrder = input.sortOrder ?? (await nextRoomOrder(db));
    const [row] = await db
      .insert(rooms)
      .values({ ...input, sortOrder })
      .returning();
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

/**
 * Soft-delete, only once nothing points at the room (OD-113, Q142): lines and jobs have to be
 * moved first, so none is left pointing at a room nobody can see.
 */
export async function removeRoom(db: Db, id: string) {
  const room = await getRoom(db, id);
  const attached = await roomAttachments(db, id);
  if (attached.lines > 0 || attached.jobs > 0) {
    throw conflict(
      `${room.name} still has ${attachmentsText(attached)}. Move them to another room first.`,
    );
  }
  await db.update(rooms).set({ deletedAt: new Date() }).where(eq(rooms.id, id));
  return { id };
}

/** Undo for removeRoom (Q142). Already live is fine; a live room with the same name isn't. */
export async function restoreRoom(db: Db, id: string) {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, id));
  if (!row) throw notFound('Room');
  if (row.deletedAt === null) return row;
  try {
    const [back] = await db
      .update(rooms)
      .set({ deletedAt: null })
      .where(eq(rooms.id, id))
      .returning();
    if (!back) throw notFound('Room');
    return back;
  } catch (e) {
    if (isUniqueViolation(e, 'rooms_name_live_uidx')) {
      throw conflict(`Another room is already called "${row.name}"`);
    }
    throw e;
  }
}

async function nextRoomOrder(db: Db): Promise<number> {
  const [r] = await db
    .select({ max: sql<number | null>`max(${rooms.sortOrder})` })
    .from(rooms)
    .where(live());
  return r?.max == null ? 0 : Number(r.max) + 1;
}

/** Move a room up or down the list (OD-117, Q141): the list is renumbered in its new order. */
export async function moveRoom(db: Db, { id, by }: Move) {
  await getRoom(db, id);
  return db.transaction(async (tx) => {
    const order = moved(await listRooms(tx), id, by);
    for (const [i, r] of order.entries()) {
      if (r.sortOrder !== i) await tx.update(rooms).set({ sortOrder: i }).where(eq(rooms.id, r.id));
    }
    return order.map((r, i) => ({ id: r.id, sortOrder: i }));
  });
}
