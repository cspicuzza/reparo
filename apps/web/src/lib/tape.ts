import type { CSSProperties } from 'react';

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

/** Where each part of the budget tape sits, as fractions of the strip (0–1). */
export type BudgetSegments = {
  /** What the strip's full width stands for: the budget, or everything used when that's more. */
  scaleCents: number;
  /** Spent within the budget, from the left. */
  spent: number;
  /** Committed within the budget, right after spent. */
  committed: number;
  /** Where the budget ends: 1 unless spending and commitments run past it. */
  budgetAt: number;
  /** Past the budget, from `budgetAt` to the end: the overrun (red). 0 when within budget. */
  over: number;
};

/**
 * The budget tape's parts (OD-109, Q115–Q116). Within budget the strip is the budget: spent,
 * then committed, then yellow for what's left. Over budget the strip runs to everything spent
 * and committed, the budget ends at a marked point, and what lies past it is the overrun.
 */
export function budgetSegments(
  spentCents: number,
  committedCents: number,
  budgetCents: number,
): BudgetSegments {
  const finite = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  const spent = finite(spentCents);
  const committed = finite(committedCents);
  const budget = finite(budgetCents);
  const used = spent + committed;
  const scale = Math.max(budget, used);
  if (scale === 0) return { scaleCents: 0, spent: 0, committed: 0, budgetAt: 1, over: 0 };
  const spentIn = Math.min(spent, budget);
  const committedIn = Math.min(used, budget) - spentIn;
  return {
    scaleCents: scale,
    spent: spentIn / scale,
    committed: committedIn / scale,
    budgetAt: budget / scale,
    over: Math.max(0, used - budget) / scale,
  };
}

/**
 * Committed money's stripes, on the tape and its legend: the fill color striped with a gap
 * color, so it reads apart from spent by pattern as well as tone (OD-109, Q116).
 */
export const COMMITTED_STRIPES: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, var(--tape-fill) 0 3px, var(--tape-committed-gap) 3px 6px)',
};

/**
 * What's left, in a legend: the plaster track with the yellow mark down its left side, as on
 * the tape (OD-138, Q203).
 */
export const LEFT_SWATCH: CSSProperties = {
  backgroundColor: 'var(--tape-track)',
  boxShadow: 'inset 3px 0 0 var(--tape)',
};
