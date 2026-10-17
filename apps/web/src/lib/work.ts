import type { RouterOutputs } from '@reparo/api';
import { formatIsoDate, isIsoDate } from '@reparo/shared';
import type { PhaseStatusInput, WorkStatusInput } from '@reparo/shared';

/** A job as the API returns it: phase, vendor, the rooms it covers, and progress. */
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
  // Not "Planned": that's the money word for what's still to spend (OD-145).
  planned: 'Not started',
  // "Underway" everywhere; the stored value stays `active` (OD-122, Q157).
  active: 'Underway',
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

/** "3 of 8 jobs done" for a phase, from the API's count; "No jobs yet" when it has none. */
export function phaseProgressText(p: { done: number; total: number }): string {
  if (p.total === 0) return 'No jobs yet';
  if (p.done >= p.total) return p.total === 1 ? 'Its one job is done' : `All ${p.total} jobs done`;
  return `${p.done} of ${p.total} ${p.total === 1 ? 'job' : 'jobs'} done`;
}

/** What a phase's status does to the money (OD-122, Q154; money-rules: active and complete count). */
export function phaseMoneyEffect(status: PhaseStatusInput): string {
  return status === 'planned' ? 'Not counted until it starts' : 'Counts toward the budget';
}

/** A phase marked complete while some of its jobs aren't done: "2 jobs are still open". */
export function openJobsText(p: { done: number; total: number }): string | null {
  const open = p.total - p.done;
  if (open <= 0) return null;
  return open === 1 ? '1 job is still open' : `${open} jobs are still open`;
}

/** "Oct 1, 2026 to Dec 15, 2026", or just the start or end; '' when neither is set. */
export function phaseDates(p: { startsOn: string | null; endsOn: string | null }): string {
  const fmt = (d: string | null) => (d && isIsoDate(d) ? formatIsoDate(d) : null);
  const start = fmt(p.startsOn);
  const end = fmt(p.endsOn);
  if (start && end) return `${start} to ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return '';
}

/**
 * Jobs under their phase, in the phases' order; phases with no jobs are left out. The API
 * already returns jobs in phase order; this only splits the list for headings.
 */
export function groupByPhase<P extends { id: string }, J extends { phaseId: string }>(
  phases: P[],
  jobs: J[],
): { phase: P; jobs: J[] }[] {
  return phases
    .map((phase) => ({ phase, jobs: jobs.filter((j) => j.phaseId === phase.id) }))
    .filter((g) => g.jobs.length > 0);
}

/** The Phases page's address: `?phase=<id>` opens that phase's panel (OD-145). */
export type PhasesSearch = { phase?: string };

const PHASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep `phase` only when it's an id; anything else in the URL is dropped. */
export function parsePhasesSearch(raw: Record<string, unknown>): PhasesSearch {
  const phase = raw['phase'];
  return typeof phase === 'string' && PHASE_ID.test(phase) ? { phase } : {};
}
