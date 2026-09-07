import { centsToDollars, type Cents } from '../types/money';
import { parseMonth } from '../engine/months';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const USD_EXACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display only. Never feed the result back into math. */
export function formatCents(value: Cents): string {
  return USD.format(centsToDollars(value));
}

export function formatCentsExact(value: Cents): string {
  return USD_EXACT.format(centsToDollars(value));
}

/** Cents -> the plain "1234.56" string a text input should show. */
export function centsToInput(value: Cents): string {
  return (centsToDollars(value) || 0).toFixed(2);
}

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
];

/** "2026-09" -> "Sep 2026". Invalid keys are returned unchanged. */
export function formatMonth(key: string): string {
  const parsed = parseMonth(key);
  if (!parsed) return key;
  return `${MONTH_NAMES[parsed.month - 1] ?? key} ${parsed.year}`;
}

export function formatRunway(months: number): string {
  if (!Number.isFinite(months)) return 'No essential outflows';
  return `${months.toFixed(1)} mo`;
}
