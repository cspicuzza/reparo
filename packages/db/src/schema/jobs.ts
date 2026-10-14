import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';
import { items } from './items';
import { phases } from './phases';
import { rooms } from './rooms';
import { workStatus } from './work-status';

/**
 * A piece of work in one phase ("Paint — Phase 1"). `spec` is the house-wide spec; the rooms
 * the job covers are `job_rooms`. Several jobs may share an item across phases.
 *
 * `status` is authoritative only when the job covers no rooms (e.g. a project fee). A job with
 * rooms gets its status from them, derived in the API — never set by hand.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Markdown. The spec every covered room uses unless it has its own. */
    spec: text('spec').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: workStatus('status').notNull().default('unstarted'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('jobs_phase_idx').on(t.phaseId), index('jobs_item_idx').on(t.itemId)],
);

/**
 * A room a job covers, with its own status. `spec` null means "same as the job"; text means
 * this room differs. One live row per (job, room); the partial unique index ignores
 * soft-deleted rows so a room can be removed and added back.
 */
export const jobRooms = pgTable(
  'job_rooms',
  {
    id: id(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    status: workStatus('status').notNull().default('unstarted'),
    /** Markdown. Null = same as the job. */
    spec: text('spec'),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('job_rooms_job_room_live_uidx')
      .on(t.jobId, t.roomId)
      .where(sql`${t.deletedAt} IS NULL`),
    index('job_rooms_room_idx').on(t.roomId),
  ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobRoom = typeof jobRooms.$inferSelect;
export type NewJobRoom = typeof jobRooms.$inferInsert;
