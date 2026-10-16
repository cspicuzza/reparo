import type { RouterOutputs } from '@reparo/api';
import { area, formatLength, sqInToSqFt } from '@reparo/shared';

export type Room = RouterOutputs['rooms']['list'][number];

/** `14' 6" × 12'` plus the floor area in sq ft when both sides are measured. */
export function describeRoom(room: Pick<Room, 'lengthIn' | 'widthIn'>): {
  dims: string | null;
  sqft: number | null;
} {
  const { lengthIn: l, widthIn: w } = room;
  if (l == null && w == null) return { dims: null, sqft: null };
  const dims = `${l == null ? '—' : formatLength(l)} × ${w == null ? '—' : formatLength(w)}`;
  const sqft = l != null && w != null ? sqInToSqFt(area(l, w)) : null;
  return { dims, sqft };
}

/** The room page's summary line, from the API's count of jobs done there. */
export function roomProgressText({ done, total }: { done: number; total: number }): string {
  if (total === 0) return 'No jobs here yet';
  if (done >= total) return total === 1 ? 'Its one job is done' : `All ${total} jobs done`;
  return `${done} of ${total} ${total === 1 ? 'job' : 'jobs'} done`;
}

/** "11 things on the list and 1 job": what still points at a room (OD-113, Q142). */
export function attachedText({ lines, jobs }: { lines: number; jobs: number }): string {
  const parts: string[] = [];
  if (lines > 0) parts.push(`${lines} ${lines === 1 ? 'thing' : 'things'} on the list`);
  if (jobs > 0) parts.push(`${jobs} ${jobs === 1 ? 'job' : 'jobs'}`);
  return parts.join(' and ');
}

/** Why a room can't be removed yet, and how to move what's on it; null when it can (Q142). */
export function roomBlockedText(
  name: string,
  attached: { lines: number; jobs: number },
): string | null {
  if (attached.lines === 0 && attached.jobs === 0) return null;
  const how: string[] = [];
  if (attached.lines > 0) {
    how.push('give each line another room (Select on Shopping moves several at once)');
  }
  if (attached.jobs > 0) how.push(`take ${name} off its jobs on the Jobs page`);
  return `${name} still has ${attachedText(attached)}. To remove it, first ${how.join(', and ')}.`;
}
