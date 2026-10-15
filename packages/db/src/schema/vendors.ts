import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';

/**
 * People we hire (M2, OD-44). Stores like Wayfair are not vendors — a shopping line has a plain
 * `store` field. `trade` is free text ("what they do"); there is no trade list.
 *
 * Archiving is the soft delete: `deleted_at` set means archived. An archived vendor is hidden
 * from the picker and the Vendors list, but jobs that name it still show its name. Live names
 * are unique so the picker doesn't offer two "Brian"s; archiving frees the name.
 */
export const vendors = pgTable(
  'vendors',
  {
    id: id(),
    name: text('name').notNull(),
    trade: text('trade').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('vendors_name_live_uidx')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
