import { describe, expect, it } from 'vitest';
import { assertCents, cents, formatMoney, formatMoneyShort, sumCents } from './money';

describe('cents()', () => {
  it.each([
    ['1234.56', 123456],
    ['$1,234.56', 123456],
    ['0', 0],
    ['7', 700],
    [' 7 ', 700],
    ['.5', 50],
    ['12.5', 1250],
    ['-12', -1200],
    ['(12.50)', -1250],
    ['-$0.05', -5],
    ['$300,000', 30000000],
    ['1,234', 123400],
    ['1,234,567.89', 123456789],
  ])('parses %s → %i', (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  it.each([
    [1234.56, 123456],
    [0, 0],
    [-0, 0],
    [12, 1200],
    [0.1, 10],
  ])('accepts number %f → %i', (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '12,34', '1,23,456', ',123', '$', '--5', '1e3', '1.2.3', '.'])(
    'rejects %s',
    (input) => {
      expect(() => cents(input)).toThrow(TypeError);
    },
  );

  it('rejects fractional cents and non-finite numbers', () => {
    expect(() => cents(1.005)).toThrow(TypeError);
    expect(() => cents(Number.NaN)).toThrow(TypeError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('assertCents()', () => {
  it('normalizes -0 and rejects non-integers', () => {
    expect(Object.is(assertCents(-0), 0)).toBe(true);
    expect(() => assertCents(1.5)).toThrow(TypeError);
    expect(() => assertCents('5')).toThrow(TypeError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });
});

describe('formatMoney()', () => {
  it.each([
    [123456, '$1,234.56'],
    [0, '$0.00'],
    [5, '$0.05'],
    [-5, '-$0.05'],
    [30000000, '$300,000.00'],
    [3283625, '$32,836.25'],
    [-132500 * 100, '-$132,500.00'],
  ])('formats %i → %s', (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it('can force a plus sign', () => {
    expect(formatMoney(100, { sign: 'always' })).toBe('+$1.00');
    expect(formatMoney(-100, { sign: 'always' })).toBe('-$1.00');
  });

  it('rejects non-integer input', () => {
    expect(() => formatMoney(1.5)).toThrow(TypeError);
  });
});

describe('formatMoneyShort()', () => {
  it.each([
    [30000000, '$300k'],
    [2736125, '$27.4k'],
    [95000, '$950'],
    [0, '$0'],
    [150, '$2'], // $1.50 rounds half away from zero
    [149, '$1'],
    [99949, '$999'],
    [99950, '$1k'], // $999.50 rounds up into thousands
    [102500, '$1k'], // $1,025: a trailing ".0" is dropped
    [104999, '$1k'],
    [105000, '$1.1k'], // $1,050 rounds half away from zero
    [999950, '$10k'], // $9,999.50
    [-2736125, '-$27.4k'], // the minus before the "$", like formatMoney
    [-150, '-$2'],
    [-50, '-$1'], // -$0.50 rounds away from zero
    [-49, '$0'], // a negative that rounds to nothing isn't "-$0"
  ])('%i → %s', (c, label) => {
    expect(formatMoneyShort(c)).toBe(label);
  });

  it('rejects non-integer input', () => {
    expect(() => formatMoneyShort(1.5)).toThrow(TypeError);
  });
});

describe('sumCents()', () => {
  it('sums and skips nullish', () => {
    expect(sumCents([100, null, 250, undefined, -50])).toBe(300);
    expect(sumCents([])).toBe(0);
  });

  it('reproduces the spreadsheet overview to the cent', () => {
    const starting = cents('300000');
    const draws = [
      cents('132500'),
      cents('75415'),
      cents('10898'),
      cents('11815.5'),
      cents('16335.25'),
      cents('20200'),
    ];
    expect(starting - sumCents(draws)).toBe(cents('32836.25'));
  });

  it('throws on overflow or bad entries', () => {
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(() => sumCents([1.5])).toThrow(TypeError);
  });
});
