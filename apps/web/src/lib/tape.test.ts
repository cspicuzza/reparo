import { describe, expect, it } from 'vitest';
import { budgetSegments, moneyTicks, progressTicks, tapeFraction } from './tape';

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

describe('budgetSegments', () => {
  it('is empty with nothing spent or committed', () => {
    expect(budgetSegments(0, 0, 1000)).toEqual({
      scaleCents: 1000,
      spent: 0,
      committed: 0,
      budgetAt: 1,
      over: 0,
    });
  });

  it('splits spent and committed within the budget', () => {
    expect(budgetSegments(200, 300, 1000)).toEqual({
      scaleCents: 1000,
      spent: 0.2,
      committed: 0.3,
      budgetAt: 1,
      over: 0,
    });
  });

  it('fills the strip exactly at the budget', () => {
    expect(budgetSegments(600, 400, 1000)).toEqual({
      scaleCents: 1000,
      spent: 0.6,
      committed: 0.4,
      budgetAt: 1,
      over: 0,
    });
  });

  it('runs past the budget and marks the overrun', () => {
    const s = budgetSegments(600, 650, 1000);
    expect(s.scaleCents).toBe(1250);
    expect(s.spent).toBeCloseTo(0.48);
    expect(s.committed).toBeCloseTo(0.32);
    expect(s.budgetAt).toBeCloseTo(0.8);
    expect(s.over).toBeCloseTo(0.2);
    expect(s.spent + s.committed + s.over).toBeCloseTo(1);
  });

  it('counts spending alone past the budget as overrun', () => {
    const s = budgetSegments(1500, 0, 1000);
    expect(s.spent).toBeCloseTo(1000 / 1500);
    expect(s.committed).toBe(0);
    expect(s.over).toBeCloseTo(500 / 1500);
  });

  it('has nothing to draw with no budget and nothing used', () => {
    expect(budgetSegments(0, 0, 0)).toEqual({
      scaleCents: 0,
      spent: 0,
      committed: 0,
      budgetAt: 1,
      over: 0,
    });
  });

  it('ignores negative and non-numbers', () => {
    expect(budgetSegments(-5, Number.NaN, 1000).spent).toBe(0);
  });
});
