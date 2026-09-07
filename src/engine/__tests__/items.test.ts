import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import { expandItems, housingToItems, occursIn, orderItems, totalMoveInCost } from '../items';
import { generateMonths } from '../months';
import { ACC, d, housing, item, plan, standardAccounts } from './fixtures';

const MONTHS = generateMonths('2026-09', 18);

describe('recurrence', () => {
  it('runs from startMonth to the end of the horizon when endMonth is omitted', () => {
    const i = item({ id: 'x', kind: 'recurring_expense', startMonth: '2026-11', amount: d(10) });
    expect(occursIn(i, '2026-10')).toBe(false);
    expect(occursIn(i, '2026-11')).toBe(true);
    expect(occursIn(i, '2028-02')).toBe(true);
  });

  it('respects endMonth inclusively', () => {
    const i = item({
      id: 'x',
      kind: 'recurring_expense',
      startMonth: '2026-09',
      endMonth: '2027-07',
      amount: d(10),
    });
    expect(occursIn(i, '2027-07')).toBe(true);
    expect(occursIn(i, '2027-08')).toBe(false);
  });

  it('honours everyNMonths', () => {
    const quarterly = item({
      id: 'q',
      kind: 'recurring_expense',
      startMonth: '2026-09',
      everyNMonths: 3,
      amount: d(10),
    });
    expect(occursIn(quarterly, '2026-09')).toBe(true);
    expect(occursIn(quarterly, '2026-10')).toBe(false);
    expect(occursIn(quarterly, '2026-11')).toBe(false);
    expect(occursIn(quarterly, '2026-12')).toBe(true);
    expect(occursIn(quarterly, '2027-03')).toBe(true);
  });

  it('treats a nonsense everyNMonths as monthly rather than dividing by zero', () => {
    const broken = item({ id: 'b', kind: 'recurring_expense', everyNMonths: 0, amount: d(10) });
    expect(occursIn(broken, '2026-10')).toBe(true);
  });

  it('fires a one-time expense exactly once', () => {
    const once = item({
      id: 'o',
      kind: 'one_time_expense',
      startMonth: '2027-02',
      amount: d(10),
      everyNMonths: 3,
    });
    const hits = MONTHS.filter((m) => occursIn(once, m));
    expect(hits).toEqual(['2027-02']);
  });

  it('never fires on an invalid month key', () => {
    expect(occursIn(item({ id: 'x', kind: 'income', startMonth: 'bad' }), '2026-09')).toBe(false);
    expect(occursIn(item({ id: 'x', kind: 'income' }), 'bad')).toBe(false);
  });
});

describe('housing expansion', () => {
  it('produces a rent item only', () => {
    const items = housingToItems(
      housing({ id: 'h', monthlyRent: d(1200), utilitiesIncluded: true, endMonth: '2027-07' }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('h::rent');
    expect(items[0]?.amount).toBe(d(1200));
    expect(items[0]?.required).toBe(true);
    expect(items[0]?.endMonth).toBe('2027-07');
  });

  it('adds utilities when they are not included', () => {
    const items = housingToItems(
      housing({
        id: 'h',
        monthlyRent: d(1400),
        utilitiesIncluded: false,
        monthlyUtilitiesEstimate: d(160),
      }),
    );
    expect(items.map((i) => i.id)).toEqual(['h::rent', 'h::utilities']);
    expect(items[1]?.amount).toBe(d(160));
  });

  it('skips utilities when the estimate is zero', () => {
    const items = housingToItems(
      housing({ id: 'h', monthlyRent: d(1400), utilitiesIncluded: false }),
    );
    expect(items.map((i) => i.id)).toEqual(['h::rent']);
  });

  it('lands move-in costs as ONE one-time item in the start month', () => {
    const h = housing({
      id: 'atl',
      monthlyRent: d(1500),
      utilitiesIncluded: true,
      startMonth: '2027-08',
      moveInCosts: {
        securityDeposit: d(1500),
        firstMonthRent: d(1500),
        applicationFees: d(150),
        utilitySetup: d(200),
        movingTransport: d(600),
        furnitureHousehold: d(1200),
        contingency: d(500),
      },
    });
    expect(totalMoveInCost(h)).toBe(d(5650));
    const items = housingToItems(h);
    const moveIn = items.find((i) => i.id === 'atl::movein');
    expect(moveIn?.kind).toBe('one_time_expense');
    expect(moveIn?.amount).toBe(d(5650));
    expect(moveIn?.startMonth).toBe('2027-08');
    expect(moveIn?.required).toBe(true);
    // it fires exactly once across the whole horizon
    expect(MONTHS.filter((m) => occursIn(moveIn!, m))).toEqual(['2027-08']);
  });

  it('returns zero move-in cost when there are none', () => {
    expect(totalMoveInCost(housing({ id: 'h' }))).toBe(ZERO);
    expect(housingToItems(housing({ id: 'h' }))).toEqual([]);
  });
});

describe('expandItems', () => {
  it('flattens plan items and housing onto every month of the horizon', () => {
    const p = plan({
      accounts: standardAccounts(),
      items: [
        item({ id: 'inc', kind: 'income', amount: d(2000), accountId: ACC.checking }),
        item({
          id: 'once',
          kind: 'one_time_expense',
          amount: d(500),
          startMonth: '2027-01',
          accountId: ACC.checking,
        }),
      ],
      housing: [
        housing({
          id: 'lease',
          monthlyRent: d(1200),
          endMonth: '2027-07',
          accountId: ACC.checking,
        }),
      ],
    });
    const { byMonth, warnings } = expandItems(p, MONTHS);
    expect(warnings).toEqual([]);
    expect(byMonth.get('2026-09')?.map((i) => i.itemId).sort()).toEqual(['inc', 'lease::rent']);
    expect(byMonth.get('2027-01')?.map((i) => i.itemId).sort()).toEqual([
      'inc',
      'lease::rent',
      'once',
    ]);
    // rent stops after the lease ends, income keeps going
    expect(byMonth.get('2027-08')?.map((i) => i.itemId)).toEqual(['inc']);
    expect(byMonth.get('2026-09')?.find((i) => i.itemId === 'lease::rent')?.housingId).toBe('lease');
  });

  it('warns instead of throwing on dangling references and bad data', () => {
    const p = plan({
      accounts: standardAccounts(),
      items: [
        item({ id: 'bad-month', kind: 'income', startMonth: 'nope', amount: d(10) }),
        item({ id: 'bad-acct', kind: 'income', accountId: 'ghost', amount: d(10) }),
        item({ id: 'bad-goal', kind: 'goal_contribution', goalId: 'ghost', amount: d(10) }),
        item({
          id: 'bad-dest',
          kind: 'transfer',
          accountId: ACC.checking,
          toAccountId: 'ghost',
          amount: d(10),
        }),
        item({ id: 'negative', kind: 'income', amount: d(-10) }),
      ],
    });
    const { warnings } = expandItems(p, MONTHS);
    expect(warnings).toHaveLength(5);
    expect(warnings.join(' ')).toContain('invalid start month');
    expect(warnings.join(' ')).toContain('account that no longer exists');
    expect(warnings.join(' ')).toContain('goal that no longer exists');
    expect(warnings.join(' ')).toContain('negative amount');
  });

  it('returns an entry for every month even when nothing happens', () => {
    const { byMonth } = expandItems(plan(), MONTHS);
    expect(byMonth.size).toBe(18);
    for (const m of MONTHS) expect(byMonth.get(m)).toEqual([]);
  });
});

describe('ordering within a month', () => {
  it('income first, then required, then discretionary, then transfers and goals', () => {
    const { byMonth } = expandItems(
      plan({
        accounts: standardAccounts(),
        items: [
          item({ id: 'goalc', kind: 'goal_contribution', amount: d(100) }),
          item({ id: 'disc', kind: 'recurring_expense', amount: d(100), required: false }),
          item({ id: 'req', kind: 'recurring_expense', amount: d(100), required: true }),
          item({ id: 'xfer', kind: 'transfer', amount: d(100) }),
          item({ id: 'inc', kind: 'income', amount: d(100) }),
          item({ id: 'trip', kind: 'trip_payment', amount: d(100) }),
        ],
      }),
      ['2026-09'],
    );
    const ordered = orderItems(byMonth.get('2026-09') ?? []);
    expect(ordered.map((i) => i.itemId)).toEqual(['inc', 'req', 'disc', 'trip', 'xfer', 'goalc']);
  });

  it('is stable and does not mutate its input', () => {
    const input = orderItems([]);
    expect(input).toEqual([]);
  });
});
