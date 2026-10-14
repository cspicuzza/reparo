import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { id, timestamps } from './columns';

/**
 * The managed catalog of kinds of work or purchase (Paint, Flooring, Ceiling Fans…).
 * Admin-managed (ADR-008). Items are never deleted: `retired_at` hides them from new work
 * while existing jobs keep pointing at them. The starter list is seeded in the M1
 * migration. Every item belongs to a category (Model fix); the API files an item created
 * without one under Misc.
 */
export const items = pgTable('items', {
  id: id(),
  name: text('name').notNull().unique(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
  retiredAt: timestamp('retired_at', { withTimezone: true, mode: 'date' }),
  ...timestamps(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
