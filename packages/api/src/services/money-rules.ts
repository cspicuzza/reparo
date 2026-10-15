import type { PhaseStatus, ShoppingStatus } from '@reparo/db';
import { sumCents } from '@reparo/shared';

// The money rules (Chris, 2026-10-14 grilling; Linear *Data model* doc → M3 → Money rules), as
// plain functions over rows so they test without a database. Every amount is integer cents.
//
// - Counting phases are `active` and `complete`. A `planned` phase shows what it would need.
// - Spent = payments on jobs + what was paid for Purchased/Returned shopping lines, less what
//   came back. Spent always counts, whatever the phase: that money has left the bank.
// - Committed (counting phases only) = each job's cost lines less its payments (never below
//   zero; nothing for a cancelled job) + the price of every To-buy shopping line.
// - Available = pool + adjustments − Spent − Committed.
// Removed rows (soft-deleted lines, payments, jobs, phases) are left out before they get here.

export type MoneyPhase = { id: string; name: string; status: PhaseStatus; sortOrder: number };
export type MoneyJob = {
  id: string;
  phaseId: string;
  /** The job's rolled-up work status is Cancelled. */
  cancelled: boolean;
  costCents: number;
  paidCents: number;
};
export type MoneyLine = {
  phaseId: string;
  roomId: string | null;
  categoryId: string;
  status: ShoppingStatus;
  priceCents: number;
  paidCents: number | null;
  refundCents: number | null;
};

export const isCounting = (status: PhaseStatus) => status === 'active' || status === 'complete';

/** What a shopping line has cost so far: what was paid, less anything that came back. */
export function lineSpent(l: Pick<MoneyLine, 'status' | 'paidCents' | 'refundCents'>): number {
  if (l.status === 'to_buy') return 0;
  return (l.paidCents ?? 0) - (l.status === 'returned' ? (l.refundCents ?? 0) : 0);
}

/** What a shopping line is still expected to cost: its price while it's To buy. */
export function lineToCome(l: Pick<MoneyLine, 'status' | 'priceCents'>): number {
  return l.status === 'to_buy' ? l.priceCents : 0;
}

/** What a job is still expected to cost: its cost lines less its payments, never below zero. */
export function jobToCome(j: Pick<MoneyJob, 'cancelled' | 'costCents' | 'paidCents'>): number {
  if (j.cancelled) return 0;
  return Math.max(j.costCents - j.paidCents, 0);
}

export type PaymentStatus =
  | { kind: 'no_price' }
  | { kind: 'unpaid' }
  | { kind: 'deposit'; percent: number }
  | { kind: 'paid' };

/**
 * Unpaid / Deposit paid (with %) / Paid in full, from a job's cost lines and payments. The
 * percent rounds down, so 99.6% reads 99% and only a full payment reads as paid.
 */
export function paymentStatus(costCents: number, paidCents: number): PaymentStatus {
  if (paidCents <= 0) return costCents > 0 ? { kind: 'unpaid' } : { kind: 'no_price' };
  if (paidCents >= costCents) return { kind: 'paid' };
  return { kind: 'deposit', percent: Math.floor((paidCents * 100) / costCents) };
}

type Totals = { spentCents: number; committedCents: number };

export type PhaseMoney = {
  id: string;
  name: string;
  status: PhaseStatus;
  counting: boolean;
  spentCents: number;
  /** Still expected to cost in this phase (counted as Committed only in a counting phase). */
  toComeCents: number;
  /** Planned phases: what Available would be after this phase's expected costs. */
  leavesCents: number | null;
};

export function moneySummary(input: {
  poolCents: number;
  phases: MoneyPhase[];
  jobs: MoneyJob[];
  lines: MoneyLine[];
}) {
  const counting = new Set(input.phases.filter((p) => isCounting(p.status)).map((p) => p.id));

  const jobsSpent = sumCents(input.jobs.map((j) => j.paidCents));
  const linesSpent = sumCents(input.lines.map(lineSpent));
  const jobsCommitted = sumCents(input.jobs.filter((j) => counting.has(j.phaseId)).map(jobToCome));
  const linesCommitted = sumCents(
    input.lines.filter((l) => counting.has(l.phaseId)).map(lineToCome),
  );
  const spentCents = jobsSpent + linesSpent;
  const committedCents = jobsCommitted + linesCommitted;
  const availableCents = input.poolCents - spentCents - committedCents;

  const byPhase: PhaseMoney[] = [...input.phases]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((p) => {
      const jobs = input.jobs.filter((j) => j.phaseId === p.id);
      const lines = input.lines.filter((l) => l.phaseId === p.id);
      const toComeCents = sumCents([...jobs.map(jobToCome), ...lines.map(lineToCome)]);
      const isCountingPhase = counting.has(p.id);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        counting: isCountingPhase,
        spentCents: sumCents([...jobs.map((j) => j.paidCents), ...lines.map(lineSpent)]),
        toComeCents,
        leavesCents: isCountingPhase ? null : availableCents - toComeCents,
      };
    });

  /** Shopping lines grouped by a key; Committed only from counting phases. */
  const group = (key: (l: MoneyLine) => string | null) => {
    const out = new Map<string | null, Totals>();
    for (const l of input.lines) {
      const k = key(l);
      const t = out.get(k) ?? { spentCents: 0, committedCents: 0 };
      t.spentCents += lineSpent(l);
      if (counting.has(l.phaseId)) t.committedCents += lineToCome(l);
      out.set(k, t);
    }
    return out;
  };

  return {
    poolCents: input.poolCents,
    spentCents,
    committedCents,
    availableCents,
    byPhase,
    jobs: { spentCents: jobsSpent, committedCents: jobsCommitted },
    shopping: { spentCents: linesSpent, committedCents: linesCommitted },
    byCategory: group((l) => l.categoryId),
    /** Key null = whole-house lines. Jobs aren't split by room (a job covers many). */
    byRoom: group((l) => l.roomId),
  };
}
