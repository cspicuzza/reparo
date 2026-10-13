// Lengths are stored in inches (ADR-004) with 1/16" precision (ADR-011): numeric(10,4).
// Input and display are feet/inches; these are the only conversions.

/** Inches, always a non-negative multiple of 1/16. */
export type Inches = number;

export const SIXTEENTH = 1 / 16;
export const INCHES_PER_FOOT = 12;
export const SQ_IN_PER_SQ_FT = 144;

/** Snap to the nearest 1/16" and normalize -0. Throws on negative or non-finite. */
export function snapInches(n: number, label = 'inches'): Inches {
  if (!Number.isFinite(n))
    throw new TypeError(`${label} must be a finite number, got ${String(n)}`);
  if (n < 0) throw new RangeError(`${label} must not be negative, got ${String(n)}`);
  const snapped = Math.round(n * 16) / 16;
  return snapped === 0 ? 0 : snapped;
}

/** Build inches from feet + inches + an optional fraction like "1/2". */
export function inches(parts: { ft?: number; in?: number; fraction?: string }): Inches {
  const ft = parts.ft ?? 0;
  const inch = parts.in ?? 0;
  const frac = parts.fraction ? parseFraction(parts.fraction) : 0;
  return snapInches(ft * INCHES_PER_FOOT + inch + frac, 'length');
}

function parseFraction(s: string): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s.trim());
  if (!m) throw new TypeError(`length: bad fraction "${s}"`);
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (den === 0) throw new TypeError(`length: bad fraction "${s}"`);
  return num / den;
}

// One number token: "3", "3.5", "1/2", "3 1/2", "3-1/2"
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:[\s-]+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)`;
const FT = String.raw`(?:'|′|ft\.?|feet|foot)`;
const IN = String.raw`(?:"|″|''|in\.?|inches|inch)`;
const RE = new RegExp(
  String.raw`^\s*(?:(${NUM})\s*${FT}\s*[-\s]?\s*)?(?:(${NUM})\s*${IN}?)?\s*$`,
  'i',
);

function numToken(tok: string): number {
  const t = tok.trim();
  if (t.includes('/')) {
    const m = /^(\d+(?:\.\d+)?)?[\s-]*(\d+)\s*\/\s*(\d+)$/.exec(t);
    if (!m) throw new TypeError(`length: cannot parse "${tok}"`);
    const whole = m[1] ? Number(m[1]) : 0;
    const den = Number(m[3]);
    if (den === 0) throw new TypeError(`length: bad fraction "${tok}"`);
    return whole + Number(m[2]) / den;
  }
  return Number(t);
}

/**
 * Parse a length string to inches. Accepts: `7' 3 1/2"`, `7'3"`, `7' 3"`, `10'-6"`,
 * `7 ft 3.5 in`, `7ft`, `7.5'`, `87.5`, `87.5"`, `3/4"`, `3 1/2`. Snaps to 1/16".
 */
export function parseLength(input: string): Inches {
  const s = input.trim();
  if (s === '') throw new TypeError('length: empty input');
  const m = RE.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) {
    throw new TypeError(`length: cannot parse "${input}"`);
  }
  const ft = m[1] !== undefined ? numToken(m[1]) : 0;
  const inch = m[2] !== undefined ? numToken(m[2]) : 0;
  return snapInches(ft * INCHES_PER_FOOT + inch, 'length');
}

/** Split inches into feet, whole inches, and sixteenths (0–15). */
export function splitInches(n: Inches): { ft: number; in: number; sixteenths: number } {
  const total16 = Math.round(snapInches(n) * 16);
  const ft = Math.floor(total16 / (16 * INCHES_PER_FOOT));
  const rem = total16 - ft * 16 * INCHES_PER_FOOT;
  return { ft, in: Math.floor(rem / 16), sixteenths: rem % 16 };
}

function fractionText(sixteenths: number): string {
  if (sixteenths === 0) return '';
  let num = sixteenths;
  let den = 16;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${num}/${den}`;
}

/**
 * Format inches as feet and inches: 87.5 → `7' 3 1/2"`; 84 → `7'`; 0.75 → `3/4"`; 0 → `0"`.
 * `style: 'inches'` gives `87 1/2"` with no feet.
 */
export function formatLength(n: Inches, opts: { style?: 'ft-in' | 'inches' } = {}): string {
  const { ft, in: whole, sixteenths } = splitInches(n);
  const frac = fractionText(sixteenths);
  if (opts.style === 'inches') {
    const w = ft * INCHES_PER_FOOT + whole;
    if (w === 0 && frac) return `${frac}"`;
    return frac ? `${w} ${frac}"` : `${w}"`;
  }
  if (ft === 0 && whole === 0) return frac ? `${frac}"` : '0"';
  const inchPart =
    whole === 0 && !frac
      ? ''
      : frac
        ? whole === 0
          ? `${frac}"`
          : `${whole} ${frac}"`
        : `${whole}"`;
  if (ft === 0) return inchPart;
  return inchPart ? `${ft}' ${inchPart}` : `${ft}'`;
}

/** Rectangle area in square inches. */
export function area(lengthIn: Inches, widthIn: Inches): number {
  return snapInches(lengthIn, 'length') * snapInches(widthIn, 'width');
}

/** Square inches → square feet, rounded to 2 decimals. */
export function sqInToSqFt(sqIn: number): number {
  if (!Number.isFinite(sqIn) || sqIn < 0)
    throw new RangeError(`area must be a non-negative number, got ${String(sqIn)}`);
  return Math.round((sqIn / SQ_IN_PER_SQ_FT) * 100) / 100;
}

/** Inches → feet as a decimal (for display like "7.29 ft"), rounded to 2 decimals. */
export function inchesToFeet(n: Inches): number {
  return Math.round((snapInches(n) / INCHES_PER_FOOT) * 100) / 100;
}
