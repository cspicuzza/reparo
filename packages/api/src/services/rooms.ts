import { and, asc, eq, isNull, rooms, type Db } from '@reparo/db';
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

/** Soft-delete. The room's work items stay (hidden with it) so a restore is possible. */
export async function removeRoom(db: Db, id: string) {
  await getRoom(db, id);
  await db.update(rooms).set({ deletedAt: new Date() }).where(eq(rooms.id, id));
  return { id };
}
