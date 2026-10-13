import { sql } from 'drizzle-orm';
import { date, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';

/** ADR-009: work and money belong to a phase. */
export const phaseStatus = pgEnum('phase_status', ['planned', 'active', 'complete']);
export type PhaseStatus = (typeof phaseStatus.enumValues)[number];

export const phases = pgTable(
  'phases',
  {
    id: id(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: phaseStatus('status').notNull().default('planned'),
    /** ISO dates (ADR-004); both optional until a phase is scheduled. */
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    /** Live phase names are unique; a soft-deleted phase frees its name. */
    uniqueIndex('phases_name_live_uidx')
      .on(t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export type Phase = typeof phases.$inferSelect;
export type NewPhase = typeof phases.$inferInsert;
