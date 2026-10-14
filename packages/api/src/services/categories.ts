import { asc, categories, eq, type Db } from '@reparo/db';
import { notFound } from './errors';

/** The six money categories (Model fix). Seeded; not editable in the app yet. */
export function listCategories(db: Db) {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function getCategory(db: Db, id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) throw notFound('Category');
  return row;
}

/** Where an item goes when it's created without a category (Chris, 2026-10-14). */
export async function miscCategory(db: Db) {
  const [row] = await db.select().from(categories).where(eq(categories.name, 'Misc'));
  if (!row) throw new Error('The Misc category is missing; run the migrations');
  return row;
}
