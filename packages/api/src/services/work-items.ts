import { and, asc, eq, isNull, or, workItems, type Db, type WorkItem } from '@reparo/db';
import type { WorkItemCreate, WorkItemList, WorkItemUpdate } from '@reparo/shared';
import { badRequest, conflict, isUniqueViolation, notFound } from './errors';
import { getItem, listItems } from './items';
import { getPhase } from './phases';
import { getRoom } from './rooms';

const live = () => isNull(workItems.deletedAt);

/** Live work items, optionally narrowed. `roomId: null` means house-wide defaults only. */
export function listWorkItems(db: Db, filter: WorkItemList = {}) {
  const conds = [live()];
  if (filter.phaseId !== undefined) conds.push(eq(workItems.phaseId, filter.phaseId));
  if (filter.itemId !== undefined) conds.push(eq(workItems.itemId, filter.itemId));
  if (filter.roomId === null) conds.push(isNull(workItems.roomId));
  else if (filter.roomId !== undefined) conds.push(eq(workItems.roomId, filter.roomId));
  return db
    .select()
    .from(workItems)
    .where(and(...conds))
    .orderBy(asc(workItems.sortOrder), asc(workItems.createdAt));
}

export async function getWorkItem(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(workItems)
    .where(and(eq(workItems.id, id), live()));
  if (!row) throw notFound('Work item');
  return row;
}

export async function createWorkItem(db: Db, input: WorkItemCreate) {
  const item = await getItem(db, input.itemId);
  if (item.retiredAt) throw badRequest(`"${item.name}" is retired; restore it to add work`);
  await getPhase(db, input.phaseId);
  if (input.roomId !== null) await getRoom(db, input.roomId);
  try {
    const [row] = await db.insert(workItems).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(
        input.roomId === null
          ? `"${item.name}" already has a house-wide default`
          : `"${item.name}" already has work in this room`,
      );
    }
    throw e;
  }
}

/** Status, spec, notes, phase, order. Item and room are fixed; delete and recreate to move one. */
export async function updateWorkItem(db: Db, { id, ...patch }: WorkItemUpdate) {
  await getWorkItem(db, id);
  if (patch.phaseId !== undefined) await getPhase(db, patch.phaseId);
  const [row] = await db
    .update(workItems)
    .set(patch)
    .where(and(eq(workItems.id, id), live()))
    .returning();
  if (!row) throw notFound('Work item');
  return row;
}

export async function removeWorkItem(db: Db, id: string) {
  await getWorkItem(db, id);
  await db.update(workItems).set({ deletedAt: new Date() }).where(eq(workItems.id, id));
  return { id };
}

export type ResolvedWork = {
  item: Awaited<ReturnType<typeof listItems>>[number];
  /** The row that applies to this room, or null if the item has no work anywhere. */
  work: WorkItem | null;
  /** Where `work` came from: the room's own override, or the house-wide default. */
  source: 'room' | 'default' | null;
  /** The house-wide default, when one exists — shown alongside an override. */
  houseDefault: WorkItem | null;
};

/**
 * Resolution rule (docs/data-model.md → M1): a room's work for an item is its own work item
 * if one exists, else the item's house-wide default. Retired items appear only if they have
 * work that applies to this room.
 */
export async function workForRoom(db: Db, roomId: string): Promise<ResolvedWork[]> {
  await getRoom(db, roomId);
  const rows = await db
    .select()
    .from(workItems)
    .where(and(live(), or(eq(workItems.roomId, roomId), isNull(workItems.roomId))))
    .orderBy(asc(workItems.sortOrder));
  const catalog = await listItems(db, { includeRetired: true });

  return catalog.flatMap((item) => {
    const own = rows.find((w) => w.itemId === item.id && w.roomId === roomId) ?? null;
    const houseDefault = rows.find((w) => w.itemId === item.id && w.roomId === null) ?? null;
    const work = own ?? houseDefault;
    if (item.retiredAt && !work) return [];
    const source: ResolvedWork['source'] = own ? 'room' : houseDefault ? 'default' : null;
    return [{ item, work, source, houseDefault }];
  });
}
