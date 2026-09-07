import { ZERO, cents, type Cents } from '../types/money';
import type { Account, Goal, HousingAssumption, Plan, PlanItem, Settings } from '../types/plan';
import type { Scenario } from '../types/scenario';
import { addMonths } from '../engine/months';

/**
 * Lauren's starter data (plan §7).
 *
 * Every amount ships as $0 on purpose — these are SHAPES, not guesses about her money.
 * Anything the plan marked as an assumption is flagged here with `ESTIMATE` in the notes so
 * the onboarding UI can label it "estimate — please confirm".
 */

export const SEED_START_MONTH = '2026-09';
export const LEASE_END_MONTH = '2027-07';
export const MOVE_MONTH = '2027-08'; // ESTIMATE: the month right after the lease ends.
export const HORIZON_MONTHS = 18;

const ESTIMATE = 'estimate — please confirm';

export const ACCOUNT_IDS = {
  checking: 'acct-checking',
  savings: 'acct-savings',
  highYield: 'acct-fidelity-cash',
  invested: 'acct-fidelity-go',
  card: 'acct-apple-card',
} as const;

export function seedAccounts(): Account[] {
  return [
    { id: ACCOUNT_IDS.checking, name: 'Checking', type: 'checking', balance: ZERO },
    { id: ACCOUNT_IDS.savings, name: 'Standard savings', type: 'savings', balance: ZERO },
    {
      id: ACCOUNT_IDS.highYield,
      name: 'Fidelity high-yield cash',
      type: 'high_yield',
      balance: ZERO,
      transferDelayDays: 2,
      notes: `Transfer delay is an ${ESTIMATE}.`,
    },
    {
      id: ACCOUNT_IDS.invested,
      name: 'Fidelity Go',
      type: 'invested',
      balance: ZERO,
      scenarioAvailableAmount: ZERO,
      notes: 'Market-exposed. $0 is approved for near-term needs until you say otherwise.',
    },
    { id: ACCOUNT_IDS.card, name: 'Apple Card', type: 'credit_card', balance: ZERO },
  ];
}

export const HOUSING_IDS = {
  currentLease: 'housing-current-lease',
  atlanta: 'housing-atlanta',
} as const;

export function seedHousing(): HousingAssumption[] {
  return [
    {
      id: HOUSING_IDS.currentLease,
      label: 'Current lease',
      monthlyRent: ZERO,
      utilitiesIncluded: true,
      startMonth: SEED_START_MONTH,
      endMonth: LEASE_END_MONTH,
      accountId: ACCOUNT_IDS.checking,
    },
    {
      id: HOUSING_IDS.atlanta,
      label: 'Atlanta apartment',
      monthlyRent: ZERO,
      utilitiesIncluded: false,
      monthlyUtilitiesEstimate: ZERO,
      startMonth: MOVE_MONTH,
      accountId: ACCOUNT_IDS.checking,
      moveInCosts: {
        securityDeposit: ZERO,
        firstMonthRent: ZERO,
        applicationFees: ZERO,
        utilitySetup: ZERO,
        movingTransport: ZERO,
        furnitureHousehold: ZERO,
        contingency: ZERO,
      },
    },
  ];
}

export const GOAL_IDS = {
  emergency: 'goal-emergency',
  nearTermBills: 'goal-near-term-bills',
  atlantaMove: 'goal-atlanta-move',
  nyc1: 'goal-nyc-1',
  nyc2: 'goal-nyc-2',
  nyc3: 'goal-nyc-3',
  michigan: 'goal-michigan',
  cruise: 'goal-cruise',
  career: 'goal-career-transition',
  scooter: 'goal-scooter',
  investing: 'goal-long-term-investing',
} as const;

type SeedGoal = Omit<Goal, 'targetAmount' | 'reservedAmount'> & {
  targetAmount?: Cents;
  reservedAmount?: Cents;
};

function goal(g: SeedGoal): Goal {
  return { ...g, targetAmount: g.targetAmount ?? ZERO, reservedAmount: g.reservedAmount ?? ZERO };
}

export function seedGoals(): Goal[] {
  return [
    goal({
      id: GOAL_IDS.emergency,
      name: 'Emergency reserve',
      priority: 'essential',
      flexibility: 'fixed',
      targetMonth: '2027-05',
      preferredAccountId: ACCOUNT_IDS.highYield,
      active: true,
      notes: `Target date is an ${ESTIMATE}.`,
    }),
    goal({
      id: GOAL_IDS.nearTermBills,
      name: 'Near-term required bills',
      priority: 'essential',
      flexibility: 'fixed',
      targetMonth: addMonths(SEED_START_MONTH, 2),
      preferredAccountId: ACCOUNT_IDS.checking,
      active: true,
      notes: 'Cash you must keep on hand for rent and bills already committed.',
    }),
    goal({
      id: GOAL_IDS.atlantaMove,
      name: 'Atlanta move fund',
      priority: 'essential',
      flexibility: 'adjustable',
      targetMonth: MOVE_MONTH,
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
      notes: `Move month is an ${ESTIMATE} — the month after the current lease ends.`,
    }),
    goal({
      id: GOAL_IDS.nyc1,
      name: 'New York City trip 1',
      priority: 'optional',
      flexibility: 'deferrable',
      targetMonth: '2026-12',
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
    }),
    goal({
      id: GOAL_IDS.nyc2,
      name: 'New York City trip 2',
      priority: 'optional',
      flexibility: 'deferrable',
      targetMonth: '2027-04',
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
    }),
    goal({
      id: GOAL_IDS.nyc3,
      name: 'New York City trip 3',
      priority: 'optional',
      flexibility: 'cancellable',
      targetMonth: '2027-10',
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
    }),
    goal({
      id: GOAL_IDS.michigan,
      name: 'Michigan trip',
      priority: 'important',
      flexibility: 'adjustable',
      targetMonth: '2027-06',
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
    }),
    goal({
      id: GOAL_IDS.cruise,
      name: 'Cruise',
      priority: 'optional',
      flexibility: 'deferrable',
      targetMonth: '2027-03',
      preferredAccountId: ACCOUNT_IDS.savings,
      active: true,
    }),
    goal({
      id: GOAL_IDS.career,
      name: 'Career transition fund',
      priority: 'important',
      flexibility: 'adjustable',
      targetMonth: '2027-01',
      preferredAccountId: ACCOUNT_IDS.highYield,
      active: true,
    }),
    goal({
      id: GOAL_IDS.scooter,
      name: 'Scooter / transportation reserve',
      priority: 'important',
      flexibility: 'adjustable',
      targetMonth: '2027-02',
      preferredAccountId: ACCOUNT_IDS.checking,
      active: true,
    }),
    goal({
      id: GOAL_IDS.investing,
      name: 'Long-term investing',
      priority: 'optional',
      flexibility: 'deferrable',
      targetMonth: addMonths(SEED_START_MONTH, HORIZON_MONTHS - 1),
      preferredAccountId: ACCOUNT_IDS.invested,
      active: true,
    }),
  ];
}

export const ITEM_IDS = {
  income: 'item-income',
  variableSpending: 'item-variable-spending',
  phone: 'item-phone',
  subscriptions: 'item-subscriptions',
  cardPayment: 'item-card-payment',
} as const;

export function seedItems(): PlanItem[] {
  return [
    {
      id: ITEM_IDS.income,
      kind: 'income',
      label: 'Income',
      amount: ZERO,
      required: false,
      startMonth: SEED_START_MONTH,
      accountId: ACCOUNT_IDS.checking,
      confidence: 'uncertain',
    },
    {
      id: ITEM_IDS.variableSpending,
      kind: 'recurring_expense',
      label: 'Variable spending budget',
      amount: ZERO,
      required: false,
      startMonth: SEED_START_MONTH,
      accountId: ACCOUNT_IDS.checking,
    },
    {
      id: ITEM_IDS.phone,
      kind: 'recurring_expense',
      label: 'Phone',
      amount: ZERO,
      required: true,
      startMonth: SEED_START_MONTH,
      accountId: ACCOUNT_IDS.checking,
    },
    {
      id: ITEM_IDS.subscriptions,
      kind: 'recurring_expense',
      label: 'Subscriptions',
      amount: ZERO,
      required: false,
      startMonth: SEED_START_MONTH,
      accountId: ACCOUNT_IDS.checking,
    },
  ];
}

export function seedSettings(): Settings {
  return {
    horizonMonths: HORIZON_MONTHS,
    startMonth: SEED_START_MONTH,
    checkingFloor: cents(100000), // ESTIMATE: $1,000
    emergencyTarget: ZERO,
    emergencyTargetMode: 'months_of_essentials',
    emergencyTargetMonths: 3, // ESTIMATE
    goalsMayReserveInvested: false, // conservative default
    currency: 'USD',
  };
}

export function seedPlan(): Plan {
  return {
    accounts: seedAccounts(),
    goals: seedGoals(),
    items: seedItems(),
    housing: seedHousing(),
  };
}

const CREATED_AT = '2026-09-01T00:00:00.000Z';

/** The eight starter scenarios from brief §6D, as override patches on the baseline. */
export function seedScenarios(): Scenario[] {
  return [
    {
      id: 'scenario-baseline',
      name: 'Baseline: no dependable income',
      description: 'No future income until a full-time job actually starts.',
      isBaseline: true,
      createdAt: CREATED_AT,
      overrides: {},
    },
    {
      id: 'scenario-part-time',
      name: 'Part-time next semester',
      description: 'Conservative take-home income starting next semester.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        itemPatches: {
          [ITEM_IDS.income]: {
            label: 'Part-time take-home',
            startMonth: '2027-01',
            confidence: 'likely',
          },
        },
      },
    },
    {
      id: 'scenario-move-first',
      name: 'Move-first',
      description: 'Emergency reserve and the Atlanta move fund come before optional travel.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        goalPatches: {
          [GOAL_IDS.nyc1]: { active: false },
          [GOAL_IDS.nyc2]: { active: false },
          [GOAL_IDS.nyc3]: { active: false },
          [GOAL_IDS.cruise]: { active: false },
        },
      },
    },
    {
      id: 'scenario-travel-heavy',
      name: 'Travel-heavy year',
      description: 'NYC x3, Michigan and the cruise all happen at their estimated budgets.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        goalPatches: {
          [GOAL_IDS.nyc1]: { active: true, priority: 'important' },
          [GOAL_IDS.nyc2]: { active: true, priority: 'important' },
          [GOAL_IDS.nyc3]: { active: true, priority: 'important' },
          [GOAL_IDS.michigan]: { active: true },
          [GOAL_IDS.cruise]: { active: true, priority: 'important' },
        },
      },
    },
    {
      id: 'scenario-lower-rent',
      name: 'Lower-rent Atlanta housing',
      description: 'Roommates or a cheaper apartment.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        housingPatches: {
          [HOUSING_IDS.atlanta]: { label: 'Atlanta apartment (with roommates)' },
        },
      },
    },
    {
      id: 'scenario-higher-rent',
      name: 'Higher-rent Atlanta housing',
      description: 'A solo apartment with larger move-in costs.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        housingPatches: {
          [HOUSING_IDS.atlanta]: { label: 'Atlanta apartment (solo)' },
        },
      },
    },
    {
      id: 'scenario-delayed-employment',
      name: 'Delayed employment',
      description: 'Full-time income starts later than hoped.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        itemPatches: {
          [ITEM_IDS.income]: { startMonth: '2027-09', confidence: 'uncertain' },
        },
      },
    },
    {
      id: 'scenario-cash-heavy',
      name: 'Cash-heavy vs investment-heavy',
      description: 'Keep more money near-liquid for upcoming commitments.',
      isBaseline: false,
      createdAt: CREATED_AT,
      overrides: {
        accountAvailability: { [ACCOUNT_IDS.invested]: ZERO },
        transferDelayDays: { [ACCOUNT_IDS.highYield]: 1 },
      },
    },
  ];
}
