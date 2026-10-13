// Calendar dates are ISO `YYYY-MM-DD` strings (ADR-004): no time, no timezone. These helpers
// treat a date as a local calendar day and never go through Date's UTC/local conversion
// for arithmetic.

export type IsoDate = string & { readonly __brand: 'IsoDate' };

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function assertIsoDate(s: unknown, label = 'date'): IsoDate {
  if (!isIsoDate(s)) throw new TypeError(`${label} must be YYYY-MM-DD, got ${String(s)}`);
  return s;
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Build an IsoDate from parts. */
export function isoDate(y: number, mo: number, d: number): IsoDate {
  return assertIsoDate(`${y.toString().padStart(4, '0')}-${pad(mo)}-${pad(d)}`);
}

/** Today's local calendar date. Pass `now` for deterministic tests. */
export function today(now: Date = new Date()): IsoDate {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Day number since the Unix epoch (UTC-anchored so DST never shifts a day). */
function dayNumber(d: IsoDate): number {
  const m = RE.exec(d);
  if (!m) throw new TypeError(`bad IsoDate ${d}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** `daysBetween('2026-01-01', '2026-01-31')` → 30. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(assertIsoDate(to, 'to')) - dayNumber(assertIsoDate(from, 'from'));
}

export function addDays(d: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new TypeError(`days must be an integer, got ${String(days)}`);
  const t = new Date((dayNumber(assertIsoDate(d)) + days) * 86_400_000);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Strictly before today. */
export function isPast(d: IsoDate, now: Date = new Date()): boolean {
  return daysBetween(today(now), assertIsoDate(d)) < 0;
}

/** ISO dates compare correctly as strings; this exists so the intent is explicit. */
export function compareIsoDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  assertIsoDate(a, 'a');
  assertIsoDate(b, 'b');
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "2026-10-13" → "Oct 13, 2026" (en-US). Display only. */
export function formatIsoDate(d: IsoDate): string {
  const m = RE.exec(assertIsoDate(d));
  if (!m) throw new TypeError(`bad IsoDate ${d}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
