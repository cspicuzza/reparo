import { describe, expect, it } from 'vitest';
import {
  area,
  formatLength,
  inches,
  inchesToFeet,
  parseLength,
  snapInches,
  splitInches,
  sqInToSqFt,
} from './length';

describe('snapInches()', () => {
  it('snaps to 1/16 and normalizes -0', () => {
    expect(snapInches(0.0625)).toBe(0.0625);
    expect(snapInches(0.06)).toBe(0.0625);
    expect(snapInches(0.04)).toBe(0.0625);
    expect(snapInches(0.03)).toBe(0); // below the half-sixteenth, rounds down
    expect(snapInches(0.03125)).toBe(0.0625); // half-sixteenth rounds up
    expect(snapInches(0.02)).toBe(0);
    expect(Object.is(snapInches(-0), 0)).toBe(true);
  });

  it('rejects negative and non-finite', () => {
    expect(() => snapInches(-1)).toThrow(RangeError);
    expect(() => snapInches(Number.NaN)).toThrow(TypeError);
    expect(() => snapInches(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('inches()', () => {
  it('builds from parts', () => {
    expect(inches({ ft: 7, in: 3, fraction: '1/2' })).toBe(87.5);
    expect(inches({ ft: 7 })).toBe(84);
    expect(inches({ in: 3, fraction: '1/16' })).toBe(3.0625);
    expect(inches({ fraction: '1/8' })).toBe(0.125);
    expect(inches({})).toBe(0);
  });

  it('rejects bad fractions', () => {
    expect(() => inches({ fraction: '1/0' })).toThrow(TypeError);
    expect(() => inches({ fraction: 'half' })).toThrow(TypeError);
    expect(() => inches({ ft: -1 })).toThrow(RangeError);
  });
});

describe('parseLength()', () => {
  it.each([
    [`7' 3 1/2"`, 87.5],
    [`7'3"`, 87],
    [`7' 3"`, 87],
    [`10'-6"`, 126],
    [`7 ft 3.5 in`, 87.5],
    [`7ft 3in`, 87],
    [`7ft`, 84],
    [`7'`, 84],
    [`7.5'`, 90],
    [`87.5`, 87.5],
    [`87.5"`, 87.5],
    [`3/4"`, 0.75],
    [`3 1/2`, 3.5],
    [`3-1/2"`, 3.5],
    [`11'6"`, 138],
    [`14' 6"`, 174],
    [`8x`, Number.NaN],
  ])('parses %s', (input, expected) => {
    if (Number.isNaN(expected)) {
      expect(() => parseLength(input)).toThrow(TypeError);
    } else {
      expect(parseLength(input)).toBe(expected);
    }
  });

  it('snaps to 1/16', () => {
    expect(parseLength('3.04')).toBe(3.0625);
    expect(parseLength('3.03')).toBe(3);
    expect(parseLength('1/32"')).toBe(0.0625);
  });

  it('rejects empty and nonsense', () => {
    expect(() => parseLength('')).toThrow(TypeError);
    expect(() => parseLength('   ')).toThrow(TypeError);
    expect(() => parseLength('seven feet')).toThrow(TypeError);
    expect(() => parseLength('1/0"')).toThrow(TypeError);
  });
});

describe('splitInches() / formatLength()', () => {
  it.each([
    [87.5, `7' 3 1/2"`],
    [87, `7' 3"`],
    [84, `7'`],
    [0.75, `3/4"`],
    [0.0625, `1/16"`],
    [3.0625, `3 1/16"`],
    [0, `0"`],
    [84.5, `7' 1/2"`],
    [138, `11' 6"`],
    [174, `14' 6"`],
    [96.125, `8' 1/8"`],
  ])('formats %f → %s', (input, expected) => {
    expect(formatLength(input)).toBe(expected);
  });

  it('formats inches-only style', () => {
    expect(formatLength(87.5, { style: 'inches' })).toBe(`87 1/2"`);
    expect(formatLength(84, { style: 'inches' })).toBe(`84"`);
    expect(formatLength(0.75, { style: 'inches' })).toBe(`3/4"`);
    expect(formatLength(0, { style: 'inches' })).toBe(`0"`);
  });

  it('round-trips parse → format', () => {
    for (const s of [`7' 3 1/2"`, `11' 6"`, `3/4"`, `0"`, `12' 11 15/16"`]) {
      expect(formatLength(parseLength(s))).toBe(s);
    }
  });

  it('splits correctly', () => {
    expect(splitInches(87.5)).toEqual({ ft: 7, in: 3, sixteenths: 8 });
    expect(splitInches(0.9375)).toEqual({ ft: 0, in: 0, sixteenths: 15 });
  });
});

describe('area() / sqInToSqFt() / inchesToFeet()', () => {
  it('computes a rug-sized rectangle', () => {
    const sqIn = area(parseLength(`11'6"`), parseLength(`14'6"`));
    expect(sqIn).toBe(138 * 174);
    expect(sqInToSqFt(sqIn)).toBe(166.75);
  });

  it('rounds to 2 decimals and rejects negatives', () => {
    expect(sqInToSqFt(100)).toBe(0.69);
    expect(() => sqInToSqFt(-1)).toThrow(RangeError);
    expect(inchesToFeet(87.5)).toBe(7.29);
    expect(inchesToFeet(0)).toBe(0);
  });
});
