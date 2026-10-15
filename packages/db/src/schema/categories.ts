import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

/**
 * Seeded in the Model fix migration (Remodel, Furnishing, Tech, Appliances, Moving, Misc) to group
 * items. Items were retired in M2 (OD-44), so nothing points here until M3 reshapes this table
 * into the shopping categories. Linear *Data model* doc → M3.
 */
export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
