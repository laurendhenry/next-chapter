import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import {
  approvedInvested,
  computeBuckets,
  computeFlexibleFunds,
  computeProtectedFunds,
  isImmediatelyAvailable,
  liquidityLabel,
  liquidityOf,
  openingBalances,
  totalOfType,
} from '../balances';
import { ACC, account, d, goal, standardAccounts } from './fixtures';

describe('liquidity is derived from the account type', () => {
  it('maps every type to the right bucket', () => {
    expect(liquidityOf('checking').bucket).toBe('fully_liquid');
    expect(liquidityOf('savings').bucket).toBe('fully_liquid');
    expect(liquidityOf('high_yield').bucket).toBe('near_liquid');
    expect(liquidityOf('invested').bucket).toBe('volatile');
    expect(liquidityOf('credit_card').bucket).toBe('debt');
  });

  it('only credit cards are excluded from assets', () => {
    expect(liquidityOf('credit_card').countsInAssets).toBe(false);
    for (const t of ['checking', 'savings', 'high_yield', 'invested'] as const) {
      expect(liquidityOf(t).countsInAssets).toBe(true);
    }
  });

  it('labels each bucket for the UI', () => {
    expect(liquidityLabel('checking')).toBe('Fully liquid');
    expect(liquidityLabel('high_yield')).toBe('Near-liquid');
    expect(liquidityLabel('invested')).toBe('Volatile');
    expect(liquidityLabel('credit_card')).toBe('Debt');
  });
});

describe('the nine balance concepts', () => {
  const accounts = standardAccounts(
    { checking: d(3000), savings: d(2000), hy: d(4000), go: d(5000), card: d(500) },
    { approved: d(1000) },
  );
  const balances = openingBalances(accounts);
  const b = computeBuckets(accounts, balances);

  it('fully liquid = checking + savings', () => {
    expect(b.fullyLiquid).toBe(d(5000));
  });

  it('near-liquid = high yield', () => {
    expect(b.nearLiquid).toBe(d(4000));
  });

  it('invested = the whole invested balance, not just the approved slice', () => {
    expect(b.invested).toBe(d(5000));
  });

  it('total assets excludes credit card debt', () => {
    expect(b.totalAssets).toBe(d(14000));
    expect(b.creditCardDebt).toBe(d(500));
  });

  it('net worth subtracts card debt', () => {
    expect(b.netWorth).toBe(d(13500));
  });

  it('planning funds include invested ONLY up to the approved amount', () => {
    // 5000 + 4000 + 1000 approved (not the full 5000)
    expect(b.planningFunds).toBe(d(10000));
  });

  it('immediate bill-pay funds cover checking, savings and eligible high yield', () => {
    expect(b.immediateBillPayFunds).toBe(d(9000));
  });

  it('an empty account list produces all zeros rather than NaN', () => {
    const empty = computeBuckets([], {});
    expect(empty.totalAssets).toBe(0);
    expect(empty.planningFunds).toBe(0);
    expect(empty.netWorth).toBe(0);
  });
});

describe('approved invested amount', () => {
  it('defaults to zero — invested money is untouchable until approved', () => {
    const go = account({ id: 'go', type: 'invested', balance: d(9000) });
    expect(approvedInvested(go)).toBe(ZERO);
  });

  it('is clamped at zero and ignored on non-invested accounts', () => {
    expect(approvedInvested(account({ id: 'go', type: 'invested', scenarioAvailableAmount: d(-50) }))).toBe(
      ZERO,
    );
    expect(
      approvedInvested(account({ id: 'c', type: 'checking', scenarioAvailableAmount: d(500) })),
    ).toBe(ZERO);
  });

  it('never counts more approved money than actually remains in the account', () => {
    const accounts = [
      account({ id: 'go', type: 'invested', balance: d(200), scenarioAvailableAmount: d(1000) }),
    ];
    const b = computeBuckets(accounts, openingBalances(accounts));
    expect(b.planningFunds).toBe(d(200));
  });

  it('honours a per-forecast override of what is left approved', () => {
    const accounts = [
      account({ id: 'go', type: 'invested', balance: d(1000), scenarioAvailableAmount: d(1000) }),
    ];
    const b = computeBuckets(accounts, openingBalances(accounts), { go: d(250) });
    expect(b.planningFunds).toBe(d(250));
  });
});

describe('immediate availability', () => {
  it('checking and savings are always immediate', () => {
    expect(isImmediatelyAvailable(account({ id: 'a', type: 'checking' }))).toBe(true);
    expect(isImmediatelyAvailable(account({ id: 'b', type: 'savings' }))).toBe(true);
  });

  it('high yield counts at every allowed delay in the MVP month-level model', () => {
    for (const delay of [1, 2, 3] as const) {
      expect(
        isImmediatelyAvailable(account({ id: 'hy', type: 'high_yield', transferDelayDays: delay })),
      ).toBe(true);
    }
  });

  it('invested and credit cards never count as bill-pay funds', () => {
    expect(isImmediatelyAvailable(account({ id: 'go', type: 'invested' }))).toBe(false);
    expect(isImmediatelyAvailable(account({ id: 'card', type: 'credit_card' }))).toBe(false);
  });
});

describe('protected and flexible funds', () => {
  const goals = [
    goal({ id: 'ess', priority: 'essential', targetAmount: d(3000), reservedAmount: d(1200) }),
    goal({ id: 'imp', priority: 'important', targetAmount: d(3000), reservedAmount: d(2000) }),
    goal({
      id: 'inactive',
      priority: 'essential',
      targetAmount: d(3000),
      reservedAmount: d(900),
      active: false,
    }),
  ];

  it('counts reserved money on ACTIVE ESSENTIAL goals plus this month required outflows', () => {
    const reserved = { ess: d(1200), imp: d(2000), inactive: d(900) };
    expect(computeProtectedFunds(goals, reserved, d(1500))).toBe(d(2700));
  });

  it('caps a reservation at its own target so over-reserving cannot inflate the number', () => {
    expect(computeProtectedFunds(goals, { ess: d(9999) }, ZERO)).toBe(d(3000));
  });

  it('flexible funds are planning funds minus protected, never negative', () => {
    expect(computeFlexibleFunds(d(10000), d(2700))).toBe(d(7300));
    expect(computeFlexibleFunds(d(1000), d(2700))).toBe(ZERO);
  });
});

describe('totalOfType', () => {
  it('sums only accounts of the requested type', () => {
    const accounts = standardAccounts({ checking: d(1000), savings: d(2000) });
    expect(totalOfType(accounts, openingBalances(accounts), 'checking')).toBe(d(1000));
    expect(totalOfType(accounts, openingBalances(accounts), 'savings')).toBe(d(2000));
    expect(totalOfType(accounts, {}, 'checking')).toBe(ZERO);
    expect(ACC.checking).toBe('checking');
  });
});
