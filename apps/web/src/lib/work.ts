import type { RouterOutputs } from '@reparo/api';
import type { PhaseStatusInput, WorkStatusInput } from '@reparo/shared';

export type WorkItem = RouterOutputs['workItems']['list'][number];
export type ResolvedWork = RouterOutputs['workItems']['forRoom'][number];
export type Phase = RouterOutputs['phases']['list'][number];

/** Display names for work status (ADR-013: Awaiting Review = done, someone has to verify it). */
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

/** First line of a spec, trimmed, for list rows. */
export function specSummary(spec: string, max = 90): string {
  const line =
    spec
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
