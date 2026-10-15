import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { id, softDelete, timestamps } from './columns';
import { jobs } from './jobs';
import { phases } from './phases';
import { rooms } from './rooms';

// Money (M3, OD-49; Linear *Data model* doc → M3). Every amount is integer cents in a bigint
// (ADR-004). Spending is two kinds: jobs (cost lines + payments) and shopping lines.

const money = (name: string) => bigint(name, { mode: 'number' });

/** To buy → Purchased (what was paid) → Returned (what came back). */
export const shoppingStatus = pgEnum('shopping_status', ['to_buy', 'purchased', 'returned']);
export type ShoppingStatus = (typeof shoppingStatus.enumValues)[number];

/**
 * One thing to buy. The phase is required ("later" is a future phase). `priceCents` is the
 * expected line total; `paidCents` is set when Purchased, `refundCents` when Returned. A line
 * may say which job it's for (tile for flooring); its money still counts once, here.
 */
export const shoppingLines = pgTable(
  'shopping_lines',
  {
    id: id(),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'restrict' }),
    /** Null = the whole house. */
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    link: text('link').notNull().default(''),
    store: text('store').notNull().default(''),
    modelNumber: text('model_number').notNull().default(''),
    /** Information only; the price is the line total. */
    quantity: integer('quantity').notNull().default(1),
    priceCents: money('price_cents').notNull().default(0),
    paidCents: money('paid_cents'),
    refundCents: money('refund_cents'),
    status: shoppingStatus('status').notNull().default('to_buy'),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('shopping_lines_phase_idx').on(t.phaseId),
    index('shopping_lines_room_idx').on(t.roomId),
    index('shopping_lines_category_idx').on(t.categoryId),
    index('shopping_lines_job_idx').on(t.jobId),
    check(
      'shopping_lines_amounts_ck',
      sql`${t.priceCents} >= 0 AND ${t.paidCents} >= 0 AND ${t.refundCents} >= 0`,
    ),
    check('shopping_lines_quantity_ck', sql`${t.quantity} >= 1`),
    check('shopping_lines_refund_ck', sql`${t.refundCents} <= ${t.paidCents}`),
    check(
      'shopping_lines_status_ck',
      sql`(${t.status} = 'to_buy' AND ${t.paidCents} IS NULL AND ${t.refundCents} IS NULL)
        OR (${t.status} = 'purchased' AND ${t.paidCents} IS NOT NULL AND ${t.refundCents} IS NULL)
        OR (${t.status} = 'returned' AND ${t.paidCents} IS NOT NULL AND ${t.refundCents} IS NOT NULL)`,
    ),
  ],
);

/** What a job costs: the vendor's price first, then permits, fees and extras. */
export const costLines = pgTable(
  'cost_lines',
  {
    id: id(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountCents: money('amount_cents').notNull(),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('cost_lines_job_idx').on(t.jobId),
    check('cost_lines_amount_ck', sql`${t.amountCents} >= 0`),
  ],
);

/** Money paid toward a job as a whole (deposit, progress, final), not toward one cost line. */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    amountCents: money('amount_cents').notNull(),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    note: text('note').notNull().default(''),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('payments_job_idx').on(t.jobId),
    check('payments_amount_ck', sql`${t.amountCents} > 0`),
  ],
);

/** The money pool: one row (the migration creates it). Only the admin changes it. */
export const budget = pgTable(
  'budget',
  {
    id: id(),
    /** Always true: with the unique index, there can only be one row. */
    singleton: boolean('singleton').notNull().default(true),
    startingCents: money('starting_cents').notNull().default(0),
    asOf: date('as_of', { mode: 'string' }),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('budget_singleton_uidx').on(t.singleton),
    check('budget_singleton_ck', sql`${t.singleton}`),
  ],
);

/** Money added to or taken from the pool ("401K loan"). Signed. Only the admin changes them. */
export const budgetAdjustments = pgTable('budget_adjustments', {
  id: id(),
  amountCents: money('amount_cents').notNull(),
  on: date('on', { mode: 'string' }).notNull(),
  note: text('note').notNull().default(''),
  ...timestamps(),
  ...softDelete(),
});

export type ShoppingLine = typeof shoppingLines.$inferSelect;
export type NewShoppingLine = typeof shoppingLines.$inferInsert;
export type CostLine = typeof costLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Budget = typeof budget.$inferSelect;
export type BudgetAdjustment = typeof budgetAdjustments.$inferSelect;
