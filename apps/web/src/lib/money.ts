import { cents, formatMoney, formatMoneyShort } from '@reparo/shared';
import type { EstimateStatusInput, ShoppingStatusInput } from '@reparo/shared';

/** Money as shown everywhere: "$1,234.56" (amounts come from the API in cents). */
export const money = (cents: number) => formatMoney(cents);

/** Cents as an amount to prefill a field with: "1,234.56" (the money schema reads it back). */
export const centsToInput = (cents: number) => formatMoney(cents).replace('$', '');

export type PaymentStatus =
  | { kind: 'no_price' }
  | { kind: 'unpaid' }
  | { kind: 'deposit'; percent: number }
  | { kind: 'paid' };

/** Unpaid / Deposit paid (28%) / Paid in full, from the API's payment status. */
export function paymentText(p: PaymentStatus): string {
  switch (p.kind) {
    case 'no_price':
      return 'No price yet';
    case 'unpaid':
      return 'Unpaid';
    case 'deposit':
      return `Deposit paid (${p.percent}%)`;
    case 'paid':
      return 'Paid in full';
  }
}

export const SHOPPING_STATUS_LABEL: Record<ShoppingStatusInput, string> = {
  to_buy: 'To buy',
  purchased: 'Purchased',
  returned: 'Returned',
};

/** Estimate statuses in household words (M4). */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatusInput, string> = {
  requested: 'Requested',
  received: 'Received',
  chosen: 'Chosen',
  declined: 'Declined',
};

type LineAmounts = {
  status: ShoppingStatusInput;
  priceCents: number;
  paidCents: number | null;
  refundCents: number | null;
};

/**
 * Whether a shopping line has its amount yet: a price while it's still to buy, what was paid
 * once it's bought. Without one it says so, never "$0.00" (OD-106, OD-145).
 */
export const lineHasAmount = (l: LineAmounts) =>
  l.status === 'to_buy' ? l.priceCents > 0 : (l.paidCents ?? 0) > 0;

/** What a shopping line's amount means right now: its price, what was paid, or what came back. */
export function lineAmountText(l: LineAmounts): string {
  if (l.status === 'to_buy') return l.priceCents > 0 ? money(l.priceCents) : 'No price yet';
  if (!lineHasAmount(l)) return l.status === 'purchased' ? 'Bought, amount not added' : 'Returned';
  if (l.status === 'purchased') return `Paid ${money(l.paidCents ?? 0)}`;
  return `Paid ${money(l.paidCents ?? 0)}, ${money(l.refundCents ?? 0)} back`;
}

const STEPS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000].map((dollars) =>
  cents(dollars),
);

/**
 * A round tick spacing for a money tape: the smallest that keeps it to 30 ticks or fewer (the
 * canvas: $300,000 in $10,000 ticks, every fifth one long).
 */
export function moneyStep(totalCents: number): number {
  const fallback = STEPS[STEPS.length - 1] ?? 10_000_000;
  if (!Number.isFinite(totalCents) || totalCents <= 0) return STEPS[0] ?? 10_000;
  return STEPS.find((s) => totalCents / s <= 30) ?? fallback;
}

/** "$300k", "$27.4k", "$950": short labels for the money tape's scale. */
export const shortMoney = (c: number) => formatMoneyShort(c);

/** "Phase 1", "Phase 0 and Phase 1", "A, B and C". */
export function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The headline: "You have $X left to spend." or, over budget, "Planned spending is $X over
 * budget." (OD-138: it was "You're $X over budget", which read as money already gone).
 */
export function headline(availableCents: number): { lead: string; amount: string; tail: string } {
  if (availableCents < 0) {
    return { lead: 'Planned spending is ', amount: money(-availableCents), tail: ' over budget.' };
  }
  return { lead: 'You have ', amount: money(availableCents), tail: ' left to spend.' };
}

/**
 * What a planned phase would do to the money: "Phase 2 would need $X, which would leave $Y."
 * `short` is true when it would leave less than nothing (shown in red).
 */
export function plannedPhaseText(p: { name: string; toComeCents: number; leavesCents: number }): {
  text: string;
  amount: string;
  short: boolean;
} {
  if (p.toComeCents === 0) {
    return { text: `Nothing is planned for ${p.name} yet.`, amount: '', short: false };
  }
  const short = p.leavesCents < 0;
  return {
    text: `${p.name} would need ${money(p.toComeCents)}, which would leave ${short ? 'you ' : ''}`,
    amount: short ? `${money(-p.leavesCents)} short` : money(p.leavesCents),
    short,
  };
}

/** Biggest first: what's spent and committed together (OD-121, Q152). */
export const bySize = <T extends { spentCents: number; committedCents: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.spentCents + b.committedCents - (a.spentCents + a.committedCents));
