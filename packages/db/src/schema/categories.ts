import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';

/**
 * Shopping categories (M3, OD-49): how shopping lines are grouped and totalled (Furniture, Rugs,
 * TV & tech…). Jobs have no category. The admin adds, renames and merges them; a merge moves
 * every line to the other category and soft-deletes this one, freeing its name.
 * Linear *Data model* doc → M3.
 */
export const categories = pgTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('categories_name_live_uidx')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
