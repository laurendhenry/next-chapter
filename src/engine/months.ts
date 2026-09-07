/**
 * Month keys are "YYYY-MM" strings. All arithmetic here is plain integer math on
 * (year * 12 + monthIndex) — no Date objects, so there is no timezone surface at all.
 */

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type ParsedMonth = { year: number; month: number };

export function isValidMonthKey(key: string): boolean {
  return MONTH_KEY.test(key);
}

export function parseMonth(key: string): ParsedMonth | null {
  const m = MONTH_KEY.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Absolute month ordinal. Used internally for comparison and differencing. */
export function monthOrdinal(key: string): number | null {
  const parsed = parseMonth(key);
  if (!parsed) return null;
  return parsed.year * 12 + (parsed.month - 1);
}

export function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function fromOrdinal(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const month = ordinal - year * 12 + 1;
  return monthKey(year, month);
}

/** Shift a month key by n months. Returns the input unchanged if it is not a valid key. */
export function addMonths(key: string, n: number): string {
  const ord = monthOrdinal(key);
  if (ord === null) return key;
  return fromOrdinal(ord + Math.trunc(n));
}

/** How many months from `a` to `b`. Positive when b is later. `null` if either is invalid. */
export function monthDiff(a: string, b: string): number | null {
  const oa = monthOrdinal(a);
  const ob = monthOrdinal(b);
  if (oa === null || ob === null) return null;
  return ob - oa;
}

/** -1 / 0 / 1. Invalid keys sort last. */
export function compareMonths(a: string, b: string): number {
  const oa = monthOrdinal(a);
  const ob = monthOrdinal(b);
  if (oa === null && ob === null) return 0;
  if (oa === null) return 1;
  if (ob === null) return -1;
  return oa === ob ? 0 : oa < ob ? -1 : 1;
}

export function isOnOrAfter(key: string, other: string): boolean {
  return compareMonths(key, other) >= 0;
}

export function isOnOrBefore(key: string, other: string): boolean {
  return compareMonths(key, other) <= 0;
}

/** The forecast horizon. Returns [] for an invalid start or a non-positive count. */
export function generateMonths(startMonth: string, count: number): string[] {
  const start = monthOrdinal(startMonth);
  if (start === null) return [];
  const n = Math.trunc(count);
  if (!Number.isFinite(n) || n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(fromOrdinal(start + i));
  return out;
}

/** Human label: "2026-09" -> "Sep 2026". */
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatMonth(key: string): string {
  const parsed = parseMonth(key);
  if (!parsed) return key;
  return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}
