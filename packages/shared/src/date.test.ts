import { describe, expect, it } from 'vitest';
import {
  addDays,
  assertIsoDate,
  compareIsoDates,
  daysBetween,
  formatIsoDate,
  isIsoDate,
  isPast,
  isoDate,
  today,
} from './date';

describe('isIsoDate()', () => {
  it.each(['2026-10-13', '2024-02-29', '2026-01-01', '2026-12-31'])('accepts %s', (s) => {
    expect(isIsoDate(s)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-1-5',
    '26-01-05',
    '2026/01/05',
    '2026-01-05T00:00:00Z',
    '',
    42,
    null,
  ])('rejects %s', (s) => {
    expect(isIsoDate(s)).toBe(false);
  });

  it('assertIsoDate throws with the label', () => {
    expect(() => assertIsoDate('nope', 'paid_on')).toThrow(/paid_on must be YYYY-MM-DD/);
  });
});

describe('today() / isoDate()', () => {
  it('uses the local calendar date of the provided clock', () => {
    expect(today(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13');
    expect(today(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(isoDate(2026, 3, 5)).toBe('2026-03-05');
  });
});

describe('daysBetween() / addDays()', () => {
  it('counts calendar days, across DST and leap days', () => {
    expect(daysBetween(assertIsoDate('2026-01-01'), assertIsoDate('2026-01-31'))).toBe(30);
    expect(daysBetween(assertIsoDate('2026-01-31'), assertIsoDate('2026-01-01'))).toBe(-30);
    expect(daysBetween(assertIsoDate('2026-03-07'), assertIsoDate('2026-03-09'))).toBe(2); // US DST 3/8
    expect(daysBetween(assertIsoDate('2024-02-28'), assertIsoDate('2024-03-01'))).toBe(2);
    expect(daysBetween(assertIsoDate('2026-10-13'), assertIsoDate('2026-10-13'))).toBe(0);
  });

  it('adds days', () => {
    expect(addDays(assertIsoDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(assertIsoDate('2026-03-01'), -1)).toBe('2026-02-28');
    expect(() => addDays(assertIsoDate('2026-03-01'), 1.5)).toThrow(TypeError);
  });
});

describe('isPast() / compareIsoDates() / formatIsoDate()', () => {
  const now = new Date(2026, 9, 13, 12);
  it('isPast is strictly before today', () => {
    expect(isPast(assertIsoDate('2026-10-12'), now)).toBe(true);
    expect(isPast(assertIsoDate('2026-10-13'), now)).toBe(false);
    expect(isPast(assertIsoDate('2026-10-14'), now)).toBe(false);
  });

  it('compares', () => {
    expect(compareIsoDates(assertIsoDate('2026-01-01'), assertIsoDate('2026-01-02'))).toBe(-1);
    expect(compareIsoDates(assertIsoDate('2026-01-02'), assertIsoDate('2026-01-02'))).toBe(0);
    expect(compareIsoDates(assertIsoDate('2026-01-03'), assertIsoDate('2026-01-02'))).toBe(1);
  });

  it('formats for display', () => {
    expect(formatIsoDate(assertIsoDate('2026-10-13'))).toBe('Oct 13, 2026');
    expect(formatIsoDate(assertIsoDate('2026-01-05'))).toBe('Jan 5, 2026');
  });
});
