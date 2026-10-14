import type { RouterOutputs } from '@reparo/api';
import type { PhaseStatusInput, WorkStatusInput } from '@reparo/shared';

/** A job as the API returns it: item, phase, the rooms it covers, and progress. */
export type Job = RouterOutputs['jobs']['list'][number];
/** One room on a job, with the spec that applies there and where it comes from. */
export type JobRoom = Job['rooms'][number];
/** One job as seen from a room page. */
export type RoomJob = RouterOutputs['jobs']['forRoom'][number];
export type Phase = RouterOutputs['phases']['list'][number];

/** Display names for work status. Awaiting review = done, someone still has to verify it. */
export const WORK_STATUS_LABEL: Record<WorkStatusInput, string> = {
  unstarted: 'Unstarted',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PHASE_STATUS_LABEL: Record<PhaseStatusInput, string> = {
  planned: 'Planned',
  active: 'Active',
  complete: 'Complete',
};

/** Where a room's spec comes from, in household words. */
export const SPEC_SOURCE_LABEL = {
  job: 'Same as the job',
  room: 'Different in this room',
} as const;

/** "6 of 9 rooms done"; a job with no rooms (a fee) shows nothing here. */
export function progressText(p: { done: number; total: number }, roomCount: number): string {
  if (roomCount === 0) return '';
  if (p.total === 0) return 'All rooms cancelled';
  return `${p.done} of ${p.total} ${p.total === 1 ? 'room' : 'rooms'} done`;
}

/** First line of a spec, trimmed, for list rows. */
export function specSummary(spec: string, max = 90): string {
  const line =
    spec
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
