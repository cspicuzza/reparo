import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

/**
 * The managed catalog of kinds of work or purchase (Paint, Flooring, Ceiling Fans…).
 * Admin-managed (ADR-008). Items are never deleted: `retired_at` hides them from new work
 * while existing work items keep pointing at them. The starter list is seeded in the M1
 * migration. `default_category_id` arrives with categories in M2.
 */
export const items = pgTable('items', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  retiredAt: timestamp('retired_at', { withTimezone: true, mode: 'date' }),
  ...timestamps(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
