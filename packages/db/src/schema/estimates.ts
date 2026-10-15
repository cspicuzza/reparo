import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { id, softDelete, timestamps } from './columns';
import { jobs } from './jobs';
import { costLines } from './money';
import { vendors } from './vendors';

// Estimates (M4, OD-62; Linear *Data model* doc → M4 → Estimates; grilling 2026-10-15). A job
// can have several, from different vendors. Choosing one ties it to the job's "<Vendor> quote"
// cost line and sets the job's vendor; the money rules only ever see cost lines, so an
// estimate that isn't chosen counts for nothing (Q3).

/** Requested (asked, no amount yet) → Received → Chosen or Declined. */
export const estimateStatus = pgEnum('estimate_status', [
  'requested',
  'received',
  'chosen',
  'declined',
]);
export type EstimateStatus = (typeof estimateStatus.enumValues)[number];

export const estimates = pgTable(
  'estimates',
  {
    id: id(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    /** One total (Q1). Null only while Requested. */
    amountCents: bigint('amount_cents', { mode: 'number' }),
    receivedOn: date('received_on', { mode: 'string' }),
    validUntil: date('valid_until', { mode: 'string' }),
    status: estimateStatus('status').notNull().default('received'),
    /**
     * When the choice of another estimate declined this one, what it was before (Requested or
     * Received), so removing the chosen one can put it back (Q27). Null for a decline by hand.
     */
    declinedFrom: estimateStatus('declined_from'),
    /** The job's quote line, while Chosen. */
    costLineId: uuid('cost_line_id').references(() => costLines.id, { onDelete: 'restrict' }),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('estimates_job_idx').on(t.jobId),
    index('estimates_vendor_idx').on(t.vendorId),
    // At most one live chosen estimate per job, and a quote line belongs to one estimate.
    uniqueIndex('estimates_one_chosen_uidx')
      .on(t.jobId)
      .where(sql`${t.status} = 'chosen' AND ${t.deletedAt} IS NULL`),
    uniqueIndex('estimates_cost_line_uidx')
      .on(t.costLineId)
      .where(sql`${t.costLineId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    check('estimates_amount_ck', sql`${t.amountCents} >= 0`),
    check(
      'estimates_amount_needed_ck',
      sql`${t.status} NOT IN ('received', 'chosen') OR ${t.amountCents} IS NOT NULL`,
    ),
    check(
      'estimates_chosen_line_ck',
      sql`(${t.status} = 'chosen') = (${t.costLineId} IS NOT NULL)`,
    ),
    check(
      'estimates_declined_from_ck',
      sql`${t.declinedFrom} IS NULL OR (${t.status} = 'declined' AND ${t.declinedFrom} IN ('requested', 'received'))`,
    ),
  ],
);

export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
