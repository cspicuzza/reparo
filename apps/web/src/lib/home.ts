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
 * Home's phase panel at a glance (OD-92): how many of the phase's jobs have started and how many
 * are done, and the jobs worth showing, those under way or waiting on someone. Cancelled jobs
 * don't count.
 */
export function phaseGlance<J extends Glanceable>(jobs: J[]): { text: string; moving: J[] } {
  const live = jobs.filter((j) => j.progress.status !== 'cancelled');
  const started = live.filter((j) => j.progress.status !== 'unstarted').length;
  const done = live.filter((j) => j.progress.status === 'completed').length;
  const noun = live.length === 1 ? 'job' : 'jobs';
  const text =
    done > 0
      ? `${started} of ${live.length} ${noun} started, ${done} done`
      : `${started} of ${live.length} ${noun} started`;
  const moving = live.filter(
    (j) => j.progress.status === 'in_progress' || j.progress.status === 'awaiting_review',
  );
  return { text, moving };
}
