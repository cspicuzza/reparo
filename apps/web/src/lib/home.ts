import type { WorkStatusInput } from '@reparo/shared';

/** "Good afternoon, Chris." by the device's local time; the first name only. */
export function greeting(now: Date, displayName?: string): string {
  const h = now.getHours();
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}.` : `Good ${part}.`;
}

type Glanceable = { progress: { status: WorkStatusInput } };

/**
 * Home's phase panel at a glance (OD-92): the jobs worth showing, those underway or waiting on
 * someone, and how many have started. Cancelled jobs don't count.
 */
export function phaseGlance<J extends Glanceable>(
  jobs: J[],
): { started: number; done: number; total: number; moving: J[] } {
  const live = jobs.filter((j) => j.progress.status !== 'cancelled');
  const started = live.filter((j) => j.progress.status !== 'unstarted').length;
  const done = live.filter((j) => j.progress.status === 'completed').length;
  const moving = live.filter(
    (j) => j.progress.status === 'in_progress' || j.progress.status === 'awaiting_review',
  );
  return { started, done, total: live.length, moving };
}

/**
 * The phase panel's heading, from its jobs rather than the phase's own flag (OD-116, Q119), so
 * it never says "underway" while nothing has started. One spelling: "underway".
 */
export function phaseHeading(
  phase: { name: string; status: 'planned' | 'active' | 'complete' } | null,
  glance: { started: number; done: number; total: number },
): string {
  if (!phase) return 'No phases yet';
  if (phase.status === 'planned') return `${phase.name} is next`;
  if (phase.status === 'complete') return `${phase.name} is complete`;
  if (glance.total === 0) return `${phase.name} is on; it has no jobs yet`;
  if (glance.started === 0) return `${phase.name} is on; nothing has started yet`;
  if (glance.done === glance.total) return `${phase.name} is on; every job is done`;
  return `${phase.name} is underway`;
}

type HomeRoom = { awaitingReview: boolean; underway: boolean };

/**
 * Home's rooms (OD-116, Q120): the ones that need someone first, then those with work in
 * progress, then the rest, each group in the house's own order.
 */
export function homeRoomOrder<R extends HomeRoom>(rooms: R[]): R[] {
  const rank = (r: R) => (r.awaitingReview ? 0 : r.underway ? 1 : 2);
  return rooms
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}
