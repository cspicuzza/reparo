import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  headline,
  lineAmountText,
  listText,
  moneyStep,
  paymentText,
  plannedPhaseText,
  shortMoney,
} from './money';

describe('money display helpers', () => {
  it('prefills fields in a form the money schema reads back', () => {
    expect(centsToInput(123456)).toBe('1,234.56');
    expect(centsToInput(0)).toBe('0.00');
  });

  it('says where a job stands with paying', () => {
    expect(paymentText({ kind: 'no_price' })).toBe('No price yet');
    expect(paymentText({ kind: 'unpaid' })).toBe('Unpaid');
    expect(paymentText({ kind: 'deposit', percent: 28 })).toBe('Deposit paid (28%)');
    expect(paymentText({ kind: 'paid' })).toBe('Paid in full');
  });

  it("says what a shopping line's amount is", () => {
    const base = { priceCents: 90000, paidCents: null, refundCents: null };
    expect(lineAmountText({ ...base, status: 'to_buy' })).toBe('$900.00');
    expect(lineAmountText({ ...base, status: 'purchased', paidCents: 85000 })).toBe('Paid $850.00');
    expect(
      lineAmountText({ ...base, status: 'returned', paidCents: 85000, refundCents: 80000 }),
    ).toBe('Paid $850.00, $800.00 back');
  });

  it('picks a round tick spacing with at most 30 ticks', () => {
    expect(moneyStep(30000000)).toBe(1000000); // $300,000 → every $10,000
    expect(moneyStep(3500000)).toBe(250000); // $35,000 → every $2,500
    expect(moneyStep(90000)).toBe(10000); // $900 → every $100
    expect(moneyStep(0)).toBe(10000);
  });

  it('writes short scale labels', () => {
    expect(shortMoney(30000000)).toBe('$300k');
    expect(shortMoney(2736125)).toBe('$27.4k');
    expect(shortMoney(95000)).toBe('$950');
  });
});

describe('money sentences', () => {
  it('lists phase names', () => {
    expect(listText([])).toBe('');
    expect(listText(['Phase 1'])).toBe('Phase 1');
    expect(listText(['Phase 0', 'Phase 1'])).toBe('Phase 0 and Phase 1');
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('says what is left, or how far over', () => {
    expect(headline(2736125)).toEqual({
      lead: 'You have ',
      amount: '$27,361.25',
      tail: ' left to spend.',
    });
    expect(headline(-500)).toEqual({ lead: "You're ", amount: '$5.00', tail: ' over budget.' });
  });

  it('says what a planned phase would need and leave', () => {
    expect(
      plannedPhaseText({ name: 'Phase 2', toComeCents: 12226000, leavesCents: -9489875 }),
    ).toEqual({
      text: 'Phase 2 would need $122,260.00, which would leave you ',
      amount: '$94,898.75 short',
      short: true,
    });
    expect(
      plannedPhaseText({ name: 'Phase 3', toComeCents: 100000, leavesCents: 500000 }).amount,
    ).toBe('$5,000.00');
    expect(plannedPhaseText({ name: 'Phase 4', toComeCents: 0, leavesCents: 0 }).text).toBe(
      'Nothing is planned for Phase 4 yet.',
    );
  });
});
