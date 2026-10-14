import { describe, expect, it } from 'vitest';
import { moneyTicks, progressTicks, tapeFraction } from './tape';

describe('tapeFraction', () => {
  it('is value over total', () => {
    expect(tapeFraction(6, 12)).toBe(0.5);
    expect(tapeFraction(27263875, 30000000)).toBeCloseTo(0.9088, 4);
  });

  it('is 0 when there is nothing to measure', () => {
    expect(tapeFraction(0, 0)).toBe(0);
    expect(tapeFraction(5, 0)).toBe(0);
    expect(tapeFraction(5, -10)).toBe(0);
  });

  it('stays within the strip', () => {
    expect(tapeFraction(15, 12)).toBe(1);
    expect(tapeFraction(-3, 12)).toBe(0);
  });

  it('ignores non-numbers', () => {
    expect(tapeFraction(Number.NaN, 12)).toBe(0);
    expect(tapeFraction(3, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('progressTicks', () => {
  it('puts a tick between each unit', () => {
    expect(progressTicks(4)).toEqual([
      { at: 0.25, major: false },
      { at: 0.5, major: false },
      { at: 0.75, major: false },
    ]);
  });

  it('has no ticks for one unit or none', () => {
    expect(progressTicks(1)).toEqual([]);
    expect(progressTicks(0)).toEqual([]);
    expect(progressTicks(-2)).toEqual([]);
  });
});

describe('moneyTicks', () => {
  it('ticks every step with every fifth long', () => {
    const ticks = moneyTicks(30000000, 1000000);
    expect(ticks).toHaveLength(29);
    expect(ticks[0]).toEqual({ at: 1 / 30, major: false });
    expect(ticks[4]).toEqual({ at: 5 / 30, major: true });
    expect(ticks.filter((t) => t.major)).toHaveLength(5);
  });

  it('leaves off a tick that would sit on the end', () => {
    expect(moneyTicks(1000, 500)).toEqual([{ at: 0.5, major: false }]);
    expect(moneyTicks(1100, 500).map((t) => t.at)).toEqual([500 / 1100, 1000 / 1100]);
  });

  it('has no ticks without a total or step', () => {
    expect(moneyTicks(0, 500)).toEqual([]);
    expect(moneyTicks(1000, 0)).toEqual([]);
    expect(moneyTicks(-1000, 500)).toEqual([]);
  });
});
