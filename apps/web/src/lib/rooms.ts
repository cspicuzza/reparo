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
  if (total === 0) return 'No jobs here yet.';
  if (done >= total) return total === 1 ? 'Its one job is done.' : `All ${total} jobs done.`;
  return `${done} of ${total} ${total === 1 ? 'job' : 'jobs'} done`;
}
