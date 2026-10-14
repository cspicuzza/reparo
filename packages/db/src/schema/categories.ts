import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

/**
 * Where money is totalled: Remodel, Furnishing, Tech, Appliances, Moving, Misc (seeded in the
 * Model fix migration). Every item belongs to one; labor and fee lines without a job pick one
 * directly (M2). Linear *Data model* doc → Model fix.
 */
export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
