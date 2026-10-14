/**
 * Geometry for the tape-measure strip (Linear → Design system → The tape motif). The numbers
 * themselves (done/total, committed/budget) come from the API; this only turns them into how
 * much of the strip is filled and where the tick marks go, as fractions of its width (0–1).
 */

export type Tick = { at: number; major: boolean };

/** How much of the strip is filled: value / total, kept within 0–1. Nothing to measure → 0. */
export function tapeFraction(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

/** Progress mode: one tick between each counted unit (e.g. each room). 1 or fewer → no ticks. */
export function progressTicks(total: number): Tick[] {
  if (!Number.isFinite(total) || total < 2) return [];
  const n = Math.min(Math.floor(total), 100);
  return Array.from({ length: n - 1 }, (_, i) => ({ at: (i + 1) / n, major: false }));
}

/**
 * Money mode: a tick every `step` cents up to `total`, every `majorEvery`th one long.
 * Ticks that would land on or past the end are left off; the strip's edge is the end.
 */
export function moneyTicks(totalCents: number, stepCents: number, majorEvery = 5): Tick[] {
  if (!Number.isFinite(totalCents) || !Number.isFinite(stepCents)) return [];
  if (totalCents <= 0 || stepCents <= 0) return [];
  const count = Math.min(Math.ceil(totalCents / stepCents) - 1, 200);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const k = i + 1;
    return { at: (k * stepCents) / totalCents, major: majorEvery > 0 && k % majorEvery === 0 };
  });
}
