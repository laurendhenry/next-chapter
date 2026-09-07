/**
 * Money is ALWAYS integer cents, behind a branded type so a raw `number` can never be
 * passed where money is expected without going through one of these constructors.
 *
 * Rounding policy (plan §4.1): any division rounds AGAINST the user.
 *  - amounts the user must contribute  -> round UP   (`divCentsCeil`)
 *  - amounts the user has available    -> round DOWN (`divCentsFloor`)
 * This guarantees the app never optimistically over-reports available money.
 */
export type Cents = number & { readonly __brand: 'Cents' };

/** Construct Cents from an integer-ish number. Non-integers are rounded half-away-from-zero. */
export function cents(n: number): Cents {
  if (!Number.isFinite(n)) return 0 as Cents;
  return (n < 0 ? -Math.round(-n) : Math.round(n)) as Cents;
}

export const ZERO: Cents = 0 as Cents;

/**
 * Parse a user-entered dollar value ("1,234.56", "$1234.5", 1234.56) into Cents.
 * Returns null for anything unparseable so callers can show a validation error.
 */
export function dollarsToCents(input: string | number): Cents | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return cents(input * 100);
  }
  const cleaned = input.replace(/[$,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Multiply in string space to dodge 1.005 * 100 = 100.49999999999999
  const negative = n < 0;
  const abs = Math.abs(n);
  const [whole = '0', frac = ''] = abs.toFixed(3).split('.');
  const wholeCents = Number(whole) * 100;
  const fracCents = Math.round(Number(`0.${frac}`) * 100);
  const total = wholeCents + fracCents;
  return cents(negative ? -total : total);
}

/** Cents -> a plain dollar number. For display only; never feed this back into math. */
export function centsToDollars(c: Cents): number {
  return c / 100;
}

export function addCents(...values: Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return cents(total);
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negCents(a: Cents): Cents {
  return cents(-a);
}

export function absCents(a: Cents): Cents {
  return cents(Math.abs(a));
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return cents(total);
}

/** Multiply money by a rate (e.g. an inflation factor). Rounds to the nearest cent. */
export function mulCentsByRate(c: Cents, rate: number): Cents {
  if (!Number.isFinite(rate)) return ZERO;
  return cents(c * rate);
}

/** Divide money, rounding UP. Use for anything the user must pay or set aside. */
export function divCentsCeil(c: Cents, divisor: number): Cents {
  if (!Number.isFinite(divisor) || divisor === 0) return c;
  return cents(Math.ceil(c / divisor));
}

/** Divide money, rounding DOWN. Use for anything the user has available. */
export function divCentsFloor(c: Cents, divisor: number): Cents {
  if (!Number.isFinite(divisor) || divisor === 0) return c;
  return cents(Math.floor(c / divisor));
}

export function maxCents(a: Cents, b: Cents): Cents {
  return (a > b ? a : b) as Cents;
}

export function minCents(a: Cents, b: Cents): Cents {
  return (a < b ? a : b) as Cents;
}

/** max(0, value) — the "never show a negative requirement" clamp used all over the engine. */
export function clampAtZero(a: Cents): Cents {
  return a > 0 ? a : ZERO;
}

export function isNegative(a: Cents): boolean {
  return a < 0;
}
