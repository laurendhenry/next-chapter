import { ZERO, cents, type Cents } from '../../types/money';
import type { Account, Goal, HousingAssumption, Plan, PlanItem, Settings } from '../../types/plan';

/** $ helper — `d(1234.56)` is 123456 cents. Test-only sugar. */
export const d = (dollars: number): Cents => cents(Math.round(dollars * 100));

export function account(overrides: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    name: overrides.id,
    balance: ZERO,
    ...overrides,
  };
}

export function item(overrides: Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind'>): PlanItem {
  return {
    label: overrides.id,
    amount: ZERO,
    required: false,
    startMonth: '2026-09',
    ...overrides,
  };
}

export function goal(overrides: Partial<Goal> & Pick<Goal, 'id'>): Goal {
  return {
    name: overrides.id,
    priority: 'important',
    flexibility: 'adjustable',
    targetAmount: ZERO,
    targetMonth: '2027-01',
    reservedAmount: ZERO,
    active: true,
    ...overrides,
  };
}

export function housing(
  overrides: Partial<HousingAssumption> & Pick<HousingAssumption, 'id'>,
): HousingAssumption {
  return {
    label: overrides.id,
    monthlyRent: ZERO,
    utilitiesIncluded: true,
    startMonth: '2026-09',
    ...overrides,
  };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    horizonMonths: 18,
    startMonth: '2026-09',
    checkingFloor: ZERO,
    emergencyTarget: ZERO,
    emergencyTargetMode: 'fixed',
    goalsMayReserveInvested: false,
    currency: 'USD',
    ...overrides,
  };
}

export function plan(overrides: Partial<Plan> = {}): Plan {
  return { accounts: [], goals: [], items: [], housing: [], ...overrides };
}

export const ACC = {
  checking: 'checking',
  savings: 'savings',
  hy: 'hy',
  go: 'go',
  card: 'card',
} as const;

/** Standard five-account setup used across most tests. */
export function standardAccounts(
  balances: Partial<Record<keyof typeof ACC, Cents>> = {},
  extras: { approved?: Cents; delay?: 1 | 2 | 3 } = {},
): Account[] {
  return [
    account({ id: ACC.checking, type: 'checking', name: 'Checking', balance: balances.checking ?? ZERO }),
    account({ id: ACC.savings, type: 'savings', name: 'Savings', balance: balances.savings ?? ZERO }),
    account({
      id: ACC.hy,
      type: 'high_yield',
      name: 'Fidelity cash',
      balance: balances.hy ?? ZERO,
      transferDelayDays: extras.delay ?? 2,
    }),
    account({
      id: ACC.go,
      type: 'invested',
      name: 'Fidelity Go',
      balance: balances.go ?? ZERO,
      scenarioAvailableAmount: extras.approved ?? ZERO,
    }),
    account({ id: ACC.card, type: 'credit_card', name: 'Apple Card', balance: balances.card ?? ZERO }),
  ];
}

/**
 * A small, hand-checkable 18-month plan used by the integration test.
 *
 * Opening: checking $3,000, savings $2,000, high-yield $4,000, Fidelity Go $5,000 ($1,000
 * approved for use), Apple Card owes $500.
 * Every month: $2,000 income, $1,200 required rent, $300 required phone+utilities,
 * $200 discretionary spending. Net +$300/month.
 */
export function demoPlan(): { plan: Plan; settings: Settings } {
  return {
    plan: plan({
      accounts: standardAccounts(
        { checking: d(3000), savings: d(2000), hy: d(4000), go: d(5000), card: d(500) },
        { approved: d(1000), delay: 2 },
      ),
      items: [
        item({
          id: 'income',
          kind: 'income',
          label: 'Income',
          amount: d(2000),
          accountId: ACC.checking,
          confidence: 'likely',
        }),
        item({
          id: 'phone',
          kind: 'recurring_expense',
          label: 'Phone and utilities',
          amount: d(300),
          required: true,
          accountId: ACC.checking,
        }),
        item({
          id: 'spending',
          kind: 'recurring_expense',
          label: 'Variable spending',
          amount: d(200),
          required: false,
          accountId: ACC.checking,
        }),
      ],
      housing: [
        housing({
          id: 'lease',
          label: 'Current lease',
          monthlyRent: d(1200),
          utilitiesIncluded: true,
          startMonth: '2026-09',
          endMonth: '2027-07',
          accountId: ACC.checking,
        }),
      ],
      goals: [
        goal({
          id: 'emergency',
          name: 'Emergency reserve',
          priority: 'essential',
          flexibility: 'fixed',
          targetAmount: d(4500),
          targetMonth: '2027-05',
          reservedAmount: d(1500),
        }),
      ],
    }),
    settings: settings({
      startMonth: '2026-09',
      horizonMonths: 18,
      checkingFloor: d(1000),
      emergencyTargetMode: 'months_of_essentials',
      emergencyTargetMonths: 3,
    }),
  };
}
