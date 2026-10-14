import { asc, eq, isNull, items, type Db } from '@reparo/db';
import type { ItemCreate, ItemUpdate } from '@reparo/shared';
import { getCategory, miscCategory } from './categories';
import { conflict, isUniqueViolation, notFound } from './errors';

/** The catalog. Retired items are included only when asked, so pickers can hide them. */
export function listItems(db: Db, opts: { includeRetired?: boolean } = {}) {
  const q = db.select().from(items).orderBy(asc(items.sortOrder), asc(items.name));
  return opts.includeRetired ? q : q.where(isNull(items.retiredAt));
}

export async function getItem(db: Db, id: string) {
  const [row] = await db.select().from(items).where(eq(items.id, id));
  if (!row) throw notFound('Item');
  return row;
}

/** Without a category the item goes under Misc. */
export async function createItem(db: Db, input: ItemCreate) {
  const categoryId =
    input.categoryId === undefined
      ? (await miscCategory(db)).id
      : (await getCategory(db, input.categoryId)).id;
  try {
    const [row] = await db
      .insert(items)
      .values({ ...input, categoryId })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'items_name_unique')) {
      throw conflict(`An item named "${input.name}" already exists`);
    }
    throw e;
  }
}

/** Rename, recategorize, reorder, retire (`retired: true`) or restore (`retired: false`). */
export async function updateItem(db: Db, { id, retired, ...patch }: ItemUpdate) {
  const current = await getItem(db, id);
  if (patch.categoryId !== undefined) await getCategory(db, patch.categoryId);
  const set = {
    ...patch,
    ...(retired === undefined
      ? {}
      : { retiredAt: retired ? (current.retiredAt ?? new Date()) : null }),
  };
  try {
    const [row] = await db.update(items).set(set).where(eq(items.id, id)).returning();
    if (!row) throw notFound('Item');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'items_name_unique')) {
      throw conflict(`An item named "${patch.name ?? ''}" already exists`);
    }
    throw e;
  }
}
