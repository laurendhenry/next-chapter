import { describe, expect, it } from 'vitest';
import {
  ZERO,
  addCents,
  cents,
  centsToDollars,
  clampAtZero,
  divCentsCeil,
  divCentsFloor,
  dollarsToCents,
  maxCents,
  minCents,
  mulCentsByRate,
  negCents,
  subCents,
  sumCents,
  type Cents,
} from '../../types/money';

describe('cents construction', () => {
  it('keeps integers intact', () => {
    expect(cents(0)).toBe(0);
    expect(cents(123456)).toBe(123456);
    expect(cents(-500)).toBe(-500);
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(cents(0.5)).toBe(1);
    expect(cents(-0.5)).toBe(-1);
    expect(cents(1.4)).toBe(1);
    expect(cents(-1.4)).toBe(-1);
  });

  it('never produces NaN or Infinity', () => {
    expect(cents(Number.NaN)).toBe(0);
    expect(cents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('dollar parsing', () => {
  it('parses common user input', () => {
    expect(dollarsToCents('1234.56')).toBe(123456);
    expect(dollarsToCents('$1,234.56')).toBe(123456);
    expect(dollarsToCents(' 1234 ')).toBe(123400);
    expect(dollarsToCents('0.01')).toBe(1);
    expect(dollarsToCents('-25.50')).toBe(-2550);
    expect(dollarsToCents(1234.56)).toBe(123456);
  });

  it('handles the classic float traps exactly', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE754 — this must still be 101 cents.
    expect(dollarsToCents('1.005')).toBe(101);
    expect(dollarsToCents('0.07')).toBe(7);
    expect(dollarsToCents('29.97')).toBe(2997);
    expect(dollarsToCents('1099.99')).toBe(109999);
  });

  it('rejects garbage instead of guessing', () => {
    for (const bad of ['', 'abc', '1.2.3', '$', '-', '.']) {
      expect(dollarsToCents(bad)).toBeNull();
    }
    expect(dollarsToCents(Number.NaN)).toBeNull();
  });

  it('round-trips back to dollars', () => {
    expect(centsToDollars(cents(123456))).toBe(1234.56);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, negates and sums', () => {
    expect(addCents(cents(100), cents(250), cents(3))).toBe(353);
    expect(subCents(cents(500), cents(125))).toBe(375);
    expect(negCents(cents(500))).toBe(-500);
    expect(sumCents([cents(1), cents(2), cents(3)])).toBe(6);
    expect(sumCents([])).toBe(0);
  });

  it('multiplies by a rate to the nearest cent', () => {
    expect(mulCentsByRate(cents(10000), 1.03)).toBe(10300);
    expect(mulCentsByRate(cents(333), 0.5)).toBe(167); // 166.5 rounds up
    expect(mulCentsByRate(cents(100), Number.NaN)).toBe(ZERO);
  });

  it('picks min, max and clamps at zero', () => {
    expect(minCents(cents(5), cents(9))).toBe(5);
    expect(maxCents(cents(5), cents(9))).toBe(9);
    expect(clampAtZero(cents(-5))).toBe(0);
    expect(clampAtZero(cents(5))).toBe(5);
  });
});

describe('rounding direction always favours caution', () => {
  it('rounds contributions UP so the user is never told they owe too little', () => {
    expect(divCentsCeil(cents(1000), 3)).toBe(334); // 333.33 -> 334
    expect(divCentsCeil(cents(100), 7)).toBe(15); // 14.28 -> 15
    expect(divCentsCeil(cents(1000), 1)).toBe(1000);
  });

  it('rounds available money DOWN so the app is never optimistic', () => {
    expect(divCentsFloor(cents(1000), 3)).toBe(333);
    expect(divCentsFloor(cents(100), 7)).toBe(14);
  });

  it('never divides by zero', () => {
    expect(divCentsCeil(cents(1000), 0)).toBe(1000);
    expect(divCentsFloor(cents(1000), 0)).toBe(1000);
    expect(divCentsCeil(cents(1000), Number.NaN)).toBe(1000);
  });

  it('ceil >= floor for every divisor', () => {
    for (let d = 1; d <= 24; d += 1) {
      expect(divCentsCeil(cents(98765), d)).toBeGreaterThanOrEqual(divCentsFloor(cents(98765), d));
    }
  });
});

describe('no float drift over a full 18-month horizon', () => {
  it('adds an awkward amount 18 times with zero drift', () => {
    const monthly = dollarsToCents('1234.57');
    expect(monthly).not.toBeNull();
    let total = ZERO;
    for (let i = 0; i < 18; i += 1) total = addCents(total, monthly as Cents);
    // 1234.57 * 18 = 22222.26
    expect(total).toBe(2222226);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('a naive float loop would drift, integer cents do not', () => {
    let float = 0;
    for (let i = 0; i < 18; i += 1) float += 0.07;
    expect(float).not.toBe(1.26); // demonstrates the bug we are avoiding

    let exact = ZERO;
    for (let i = 0; i < 18; i += 1) exact = addCents(exact, cents(7));
    expect(exact).toBe(126);
  });

  it('stays integral through mixed add/subtract/divide cycles', () => {
    let balance = cents(500000);
    for (let i = 0; i < 18; i += 1) {
      balance = subCents(balance, cents(83333));
      balance = addCents(balance, divCentsFloor(cents(100000), 3));
    }
    // 500000 - 18*83333 + 18*33333 = 500000 - 1499994 + 599994 = -400000
    expect(balance).toBe(-400000);
    expect(Number.isInteger(balance)).toBe(true);
  });
});
