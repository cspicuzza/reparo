// Money is integer cents everywhere (ADR-004). These are the only conversions.

/** Integer cents. Negative is allowed (adjustments, refunds). */
export type Cents = number;

const MAX = Number.MAX_SAFE_INTEGER;

/** Throws unless `n` is a safe integer. Normalizes -0 to 0. */
export function assertCents(n: unknown, label = 'cents'): Cents {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new TypeError(`${label} must be a safe integer number of cents, got ${String(n)}`);
  }
  return n === 0 ? 0 : n;
}

/**
 * Parse a dollar amount into cents. Accepts "1234.56", "$1,234.56", "-12", "(12.50)",
 * " 7 ", and numbers. Rejects more than two decimals, NaN/Infinity, and empty input.
 */
export function cents(input: string | number): Cents {
  if (typeof input === 'number') {
    if (!Number.isFinite(input))
      throw new TypeError(`cents: not a finite number: ${String(input)}`);
    const scaled = Math.round(input * 100);
    if (Math.abs(scaled - input * 100) > 1e-6) {
      throw new TypeError(`cents: more than two decimal places: ${String(input)}`);
    }
    return assertCents(scaled);
  }
  let s = input.trim();
  if (s === '') throw new TypeError('cents: empty input');
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  if (s.startsWith('$')) s = s.slice(1).trim();
  if (s.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(s)) {
    throw new TypeError(`cents: commas must group thousands: "${input}"`);
  }
  s = s.replace(/,/g, '');
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) throw new TypeError(`cents: cannot parse "${input}"`);
  const whole = m[1] === '' ? 0 : Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  const value = whole * 100 + frac;
  if (value > MAX) throw new TypeError(`cents: out of range "${input}"`);
  return assertCents(negative ? -value : value);
}

/** 123456 → "$1,234.56"; -5 → "-$0.05". */
export function formatMoney(c: Cents, opts: { sign?: 'auto' | 'always' } = {}): string {
  assertCents(c);
  const negative = c < 0;
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  const body = `$${whole}.${frac}`;
  if (negative) return `-${body}`;
  return opts.sign === 'always' ? `+${body}` : body;
}

/** Integer division of safe integers, toward zero, with no float rounding. */
const div = (n: number, d: number) => (n - (n % d)) / d;

/**
 * Short labels for a money scale: 30000000 → "$300k", 2736125 → "$27.4k", 95000 → "$950"
 * (OD-165). From $1,000 up: thousands, to one decimal, a trailing ".0" dropped ("$1k"); below:
 * whole dollars. Rounds half away from zero; a negative keeps formatMoney's "-$" and one that
 * rounds to nothing shows "$0".
 */
export function formatMoneyShort(c: Cents): string {
  assertCents(c);
  const abs = Math.abs(c);
  let body: string;
  let zero: boolean;
  const dollars = div(abs + 50, 100);
  if (dollars >= 1000) {
    const tenths = div(abs + 5_000, 10_000); // hundreds of dollars = tenths of a thousand
    const whole = div(tenths, 10);
    const decimal = tenths % 10;
    body = `$${whole}${decimal === 0 ? '' : `.${decimal}`}k`;
    zero = false;
  } else {
    body = `$${dollars}`;
    zero = dollars === 0;
  }
  return c < 0 && !zero ? `-${body}` : body;
}

/** Sum with overflow check. Nullish entries are skipped (an actual that isn't known yet). */
export function sumCents(values: Iterable<Cents | null | undefined>): Cents {
  let total = 0;
  for (const v of values) {
    if (v == null) continue;
    total += assertCents(v);
    if (!Number.isSafeInteger(total)) throw new RangeError('sumCents: overflow');
  }
  return total;
}
