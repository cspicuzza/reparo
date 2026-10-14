import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Status of a piece of work, per room on a job (or on the job itself when it covers no rooms).
 * `awaiting_review` means the work is done and someone still has to verify it's good; no reviewer
 * or timestamp is recorded. Cancelled work is excluded from budget math (M2).
 */
export const workStatus = pgEnum('work_status', [
  'unstarted',
  'in_progress',
  'awaiting_review',
  'completed',
  'cancelled',
]);
export type WorkStatus = (typeof workStatus.enumValues)[number];
