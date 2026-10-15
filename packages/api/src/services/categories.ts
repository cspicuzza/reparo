import { and, asc, categories, count, eq, isNull, shoppingLines, sql, type Db } from '@reparo/db';
import type { CategoryCreate, CategoryMerge, CategoryUpdate } from '@reparo/shared';
import { conflict, isUniqueViolation, notFound } from './errors';

// Shopping categories (M3, OD-50). The admin adds, renames and merges them; a merge moves every
// line to the other category and then removes this one (soft delete), so starting fine-grained
// and combining later is cheap (Chris, 2026-10-14, Q21).

const live = () => isNull(categories.deletedAt);
const NAME_TAKEN = 'categories_name_live_uidx';
const taken = (name: string) => conflict(`There's already a category called ${name}`);

/** Live categories in order, each with how many live shopping lines it holds. */
export async function listCategories(db: Db) {
  const rows = await db
    .select({ category: categories, lineCount: count(shoppingLines.id) })
    .from(categories)
    .leftJoin(
      shoppingLines,
      and(eq(shoppingLines.categoryId, categories.id), isNull(shoppingLines.deletedAt)),
    )
    .where(live())
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map(({ category, lineCount }) => ({ ...category, lineCount }));
}

export async function getCategory(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), live()));
  if (!row) throw notFound('Category');
  return row;
}

/** New categories go to the end of the list. */
export async function createCategory(db: Db, input: CategoryCreate) {
  const [last] = await db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)`.mapWith(Number) })
    .from(categories)
    .where(live());
  try {
    const [row] = await db
      .insert(categories)
      .values({ name: input.name, sortOrder: (last?.max ?? 0) + 10 })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, NAME_TAKEN)) throw taken(input.name);
    throw e;
  }
}

export async function updateCategory(db: Db, { id, ...patch }: CategoryUpdate) {
  await getCategory(db, id);
  try {
    const [row] = await db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.id, id), live()))
      .returning();
    if (!row) throw notFound('Category');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, NAME_TAKEN)) throw taken(patch.name ?? 'that');
    throw e;
  }
}

/**
 * Move every line in `id` (removed ones too, so restoring a line can't bring the old category
 * back) to `intoId`, then remove `id`. Returns the category merged into, with its new count.
 */
export async function mergeCategory(db: Db, { id, intoId }: CategoryMerge) {
  const from = await getCategory(db, id);
  const into = await getCategory(db, intoId);
  const moved = await db.transaction(async (tx) => {
    const rows = await tx
      .update(shoppingLines)
      .set({ categoryId: into.id })
      .where(eq(shoppingLines.categoryId, from.id))
      .returning({ id: shoppingLines.id });
    await tx.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, from.id));
    return rows.length;
  });
  return { into, moved };
}
