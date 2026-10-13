import { sql } from 'drizzle-orm';
import { integer, numeric, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';

/**
 * A space in the house. Measurements are inches as numeric(10,4), snapped to 1/16" by
 * `@reparo/shared` before they get here (ADR-011). ADR-013: length, width and ceiling height
 * only; openings and derived wall areas are deferred.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    lengthIn: numeric('length_in', { precision: 10, scale: 4, mode: 'number' }),
    widthIn: numeric('width_in', { precision: 10, scale: 4, mode: 'number' }),
    ceilingHeightIn: numeric('ceiling_height_in', { precision: 10, scale: 4, mode: 'number' }),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('rooms_name_live_uidx')
      .on(t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
