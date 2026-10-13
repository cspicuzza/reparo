import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';
import { items } from './items';
import { phases } from './phases';
import { rooms } from './rooms';

/**
 * ADR-013: `awaiting_review` means the work is done and someone still has to verify it's good.
 * No reviewer or timestamp is recorded. `cancelled` work is excluded from budget math (M2).
 */
export const workStatus = pgEnum('work_status', [
  'unstarted',
  'in_progress',
  'awaiting_review',
  'completed',
  'cancelled',
]);
export type WorkStatus = (typeof workStatus.enumValues)[number];

/**
 * Item × room, in a phase (ADR-009). `room_id` NULL is the item's house-wide default; a row
 * with a room overrides it. One live row per (item, room) including the NULL room — enforced by
 * the two partial unique indexes below, which ignore soft-deleted rows so an override can be
 * deleted and recreated. `vendor_id` arrives with vendors in M3.
 */
export const workItems = pgTable(
  'work_items',
  {
    id: id(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'restrict' }),
    status: workStatus('status').notNull().default('unstarted'),
    /** Markdown. */
    spec: text('spec').notNull().default(''),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('work_items_item_room_live_uidx')
      .on(t.itemId, t.roomId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.roomId} IS NOT NULL`),
    uniqueIndex('work_items_item_default_live_uidx')
      .on(t.itemId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.roomId} IS NULL`),
    index('work_items_phase_idx').on(t.phaseId),
    index('work_items_room_idx').on(t.roomId),
  ],
);

export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;
