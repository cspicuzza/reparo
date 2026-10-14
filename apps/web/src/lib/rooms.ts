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
