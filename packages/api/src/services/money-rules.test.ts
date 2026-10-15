import { describe, expect, it } from 'vitest';
import {
  jobToCome,
  lineSpent,
  moneySummary,
  paymentStatus,
  type MoneyJob,
  type MoneyLine,
  type MoneyPhase,
} from './money-rules';

const P1: MoneyPhase = { id: 'p1', name: 'Phase 1', status: 'active', sortOrder: 1 };
const P2: MoneyPhase = { id: 'p2', name: 'Phase 2', status: 'planned', sortOrder: 2 };
const DONE: MoneyPhase = { id: 'p0', name: 'Phase 0', status: 'complete', sortOrder: 0 };

const job = (over: Partial<MoneyJob>): MoneyJob => ({
  id: 'j',
  phaseId: 'p1',
  cancelled: false,
  costCents: 0,
  paidCents: 0,
  ...over,
});
const line = (over: Partial<MoneyLine>): MoneyLine => ({
  phaseId: 'p1',
  roomId: null,
  categoryId: 'c',
  status: 'to_buy',
  priceCents: 0,
  paidCents: null,
  refundCents: null,
  ...over,
});

describe('money rules', () => {
  it('a shopping line costs what was paid, less what came back', () => {
    expect(lineSpent(line({ status: 'to_buy', priceCents: 900 }))).toBe(0);
    expect(lineSpent(line({ status: 'purchased', paidCents: 850 }))).toBe(850);
    expect(lineSpent(line({ status: 'returned', paidCents: 850, refundCents: 800 }))).toBe(50);
  });

  it("a job's money still to come never goes below zero, and is nothing once cancelled", () => {
    expect(jobToCome({ cancelled: false, costCents: 1000, paidCents: 300 })).toBe(700);
    expect(jobToCome({ cancelled: false, costCents: 1000, paidCents: 1200 })).toBe(0);
    expect(jobToCome({ cancelled: true, costCents: 1000, paidCents: 300 })).toBe(0);
  });

  it('payment status: no price, unpaid, deposit with % rounded down, paid in full', () => {
    expect(paymentStatus(0, 0)).toEqual({ kind: 'no_price' });
    expect(paymentStatus(3500000, 0)).toEqual({ kind: 'unpaid' });
    expect(paymentStatus(3500000, 1000000)).toEqual({ kind: 'deposit', percent: 28 });
    expect(paymentStatus(1000, 996)).toEqual({ kind: 'deposit', percent: 99 });
    expect(paymentStatus(1000, 1000)).toEqual({ kind: 'paid' });
    expect(paymentStatus(0, 500)).toEqual({ kind: 'paid' });
  });

  it('Spent, Committed and Available follow the agreed rules', () => {
    const s = moneySummary({
      poolCents: 30000000,
      phases: [P1, P2, DONE],
      jobs: [
        // Phase 1: $35,000 paint with a $10,000 deposit → $25,000 still to come.
        job({ id: 'paint', costCents: 3500000, paidCents: 1000000 }),
        // A cancelled job's deposit still counts as spent; nothing more is committed.
        job({ id: 'gone', cancelled: true, costCents: 500000, paidCents: 100000 }),
        // Phase 2 (planned): nothing committed, but a payment there still counts as spent.
        job({ id: 'bath', phaseId: 'p2', costCents: 1500000, paidCents: 200000 }),
        // Finished phase, fully paid.
        job({ id: 'demo', phaseId: 'p0', costCents: 1650000, paidCents: 1650000 }),
      ],
      lines: [
        line({ status: 'to_buy', priceCents: 500000, categoryId: 'furniture', roomId: 'living' }),
        line({ status: 'purchased', priceCents: 90000, paidCents: 85000, categoryId: 'rugs' }),
        line({ status: 'returned', paidCents: 20000, refundCents: 18000, categoryId: 'rugs' }),
        // A planned phase's line: not committed yet.
        line({ phaseId: 'p2', status: 'to_buy', priceCents: 300000, categoryId: 'furniture' }),
      ],
    });
    const spent = 1000000 + 100000 + 200000 + 1650000 + 85000 + 2000;
    const committed = 2500000 + 500000;
    expect(s.spentCents).toBe(spent);
    expect(s.committedCents).toBe(committed);
    expect(s.availableCents).toBe(30000000 - spent - committed);
    expect(s.jobs).toEqual({ spentCents: 2950000, committedCents: 2500000 });
    expect(s.shopping).toEqual({ spentCents: 87000, committedCents: 500000 });

    // Phases come in order; a planned phase says what it would need and what it would leave.
    expect(s.byPhase.map((p) => [p.name, p.counting, p.toComeCents, p.leavesCents])).toEqual([
      ['Phase 0', true, 0, null],
      ['Phase 1', true, 3000000, null],
      ['Phase 2', false, 1300000 + 300000, s.availableCents - 1600000],
    ]);

    // Category and room totals cover shopping lines; planned phases aren't committed there either.
    expect(s.byCategory.get('furniture')).toEqual({ spentCents: 0, committedCents: 500000 });
    expect(s.byCategory.get('rugs')).toEqual({ spentCents: 87000, committedCents: 0 });
    expect(s.byRoom.get('living')).toEqual({ spentCents: 0, committedCents: 500000 });
    expect(s.byRoom.get(null)).toEqual({ spentCents: 87000, committedCents: 0 });
  });

  it('Available can go below zero (over budget)', () => {
    const s = moneySummary({
      poolCents: 100,
      phases: [P1],
      jobs: [job({ costCents: 500 })],
      lines: [],
    });
    expect(s.availableCents).toBe(-400);
  });
});
