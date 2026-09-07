import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import type { MonthResult } from '../../types/forecast';
import {
  atlantaMoveTarget,
  essentialMonthlyOutflow,
  resolveEmergencyTarget,
  runwayMonths,
} from '../metrics';
import { runForecast } from '../index';
import { ACC, d, demoPlan, goal, housing, item, plan, settings, standardAccounts } from './fixtures';

const month = (over: Partial<MonthResult>): MonthResult =>
  ({
    month: '2026-09',
    openingPlanningFunds: ZERO,
    openingBillPayFunds: ZERO,
    income: ZERO,
    requiredOutflows: ZERO,
    discretionaryOutflows: ZERO,
    goalContributions: ZERO,
    netTransfers: ZERO,
    creditCardPayments: ZERO,
    endingPlanningFunds: ZERO,
    endingByAccount: {},
    endingFullyLiquid: ZERO,
    endingNearLiquid: ZERO,
    endingInvested: ZERO,
    endingBillPayFunds: ZERO,
    endingCreditCardDebt: ZERO,
    protectedFunds: ZERO,
    flexibleFunds: ZERO,
    goalProgress: [],
    investedDraws: [],
    shortfalls: [],
    lineItems: [],
    ...over,
  }) as MonthResult;

describe('essential monthly outflow', () => {
  it('averages the first three months, rounding DOWN', () => {
    const months = [
      month({ requiredOutflows: d(1000) }),
      month({ requiredOutflows: d(1500) }),
      month({ requiredOutflows: d(1501) }),
      month({ requiredOutflows: d(9999) }), // ignored, outside the window
    ];
    // (1000 + 1500 + 1501) / 3 = 1333.666... -> 1333.66
    expect(essentialMonthlyOutflow(months)).toBe(133366);
  });

  it('uses however many months exist when there are fewer than three', () => {
    expect(essentialMonthlyOutflow([month({ requiredOutflows: d(900) })])).toBe(d(900));
  });

  it('is zero for an empty forecast rather than NaN', () => {
    expect(essentialMonthlyOutflow([])).toBe(ZERO);
  });
});

describe('runway', () => {
  it('divides available funds by the monthly burn, rounded DOWN to one decimal', () => {
    expect(runwayMonths(d(9000), d(1500))).toBe(6);
    expect(runwayMonths(d(10000), d(1500))).toBe(6.6); // 6.666 -> 6.6, never 6.7
    expect(runwayMonths(d(1000), d(3000))).toBe(0.3);
  });

  it('is Infinity when there is nothing to burn', () => {
    expect(runwayMonths(d(9000), ZERO)).toBe(Number.POSITIVE_INFINITY);
  });

  it('is zero when there is no money', () => {
    expect(runwayMonths(ZERO, d(1500))).toBe(0);
    expect(runwayMonths(d(-500), d(1500))).toBe(0);
  });
});

describe('emergency target', () => {
  it('uses the fixed amount in fixed mode', () => {
    expect(resolveEmergencyTarget(settings({ emergencyTargetMode: 'fixed', emergencyTarget: d(7500) }), d(1500))).toBe(
      d(7500),
    );
  });

  it('multiplies the burn in months-of-essentials mode', () => {
    expect(
      resolveEmergencyTarget(
        settings({ emergencyTargetMode: 'months_of_essentials', emergencyTargetMonths: 3 }),
        d(1500),
      ),
    ).toBe(d(4500));
  });

  it('defaults to three months when the count is missing', () => {
    expect(
      resolveEmergencyTarget(settings({ emergencyTargetMode: 'months_of_essentials' }), d(1000)),
    ).toBe(d(3000));
  });
});

describe('Atlanta move target', () => {
  const withCosts = housing({
    id: 'atl',
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

  it('sums all seven move-in cost fields', () => {
    expect(atlantaMoveTarget(plan({ housing: [withCosts] }), ['2026-09', '2027-08'])).toBe(d(5650));
  });

  it('ignores a move that falls outside the horizon', () => {
    expect(atlantaMoveTarget(plan({ housing: [withCosts] }), ['2026-09', '2026-10'])).toBe(ZERO);
  });

  it('is zero when there is no move planned', () => {
    expect(atlantaMoveTarget(plan({ housing: [housing({ id: 'lease' })] }), ['2026-09'])).toBe(ZERO);
  });
});

describe('lowest-balance identification', () => {
  it('names the month with the lowest projected balances', () => {
    // income stops after 6 months, so balances fall from month 7 onward
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(5000) }),
        items: [
          item({
            id: 'inc',
            kind: 'income',
            amount: d(1000),
            startMonth: '2026-09',
            endMonth: '2027-02',
            accountId: ACC.checking,
          }),
          item({
            id: 'bills',
            kind: 'recurring_expense',
            amount: d(800),
            required: true,
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 12 }),
    );
    // last month of the horizon is the trough
    expect(result.metrics.lowestCheckingBalance.month).toBe('2027-08');
    expect(result.metrics.lowestPlanningFunds.month).toBe('2027-08');
    expect(result.metrics.lowestBillPayBalance.month).toBe('2027-08');
    // 5000 + 6*1000 - 12*800 = 5000 + 6000 - 9600 = 1400
    expect(result.metrics.lowestCheckingBalance.amount).toBe(d(1400));
  });
});

describe('move readiness', () => {
  it('compares planning funds the month BEFORE the move against the move cost', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(4000) }),
        housing: [
          housing({
            id: 'atl',
            label: 'Atlanta apartment',
            startMonth: '2026-11',
            monthlyRent: ZERO,
            accountId: ACC.checking,
            moveInCosts: {
              securityDeposit: d(2000),
              firstMonthRent: d(2000),
              applicationFees: ZERO,
              utilitySetup: ZERO,
              movingTransport: ZERO,
              furnitureHousehold: ZERO,
              contingency: ZERO,
            },
          }),
        ],
      }),
      settings({ horizonMonths: 4 }),
    );
    const move = result.metrics.moveReady;
    expect(move?.targetMonth).toBe('2026-11');
    expect(move?.cost).toBe(d(4000));
    expect(move?.available).toBe(d(4000));
    expect(move?.ready).toBe(true);
    expect(move?.gap).toBe(ZERO);
  });

  it('reports the exact gap when the money is not there', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(1200) }),
        housing: [
          housing({
            id: 'atl',
            startMonth: '2026-11',
            accountId: ACC.checking,
            moveInCosts: {
              securityDeposit: d(2000),
              firstMonthRent: ZERO,
              applicationFees: ZERO,
              utilitySetup: ZERO,
              movingTransport: ZERO,
              furnitureHousehold: ZERO,
              contingency: ZERO,
            },
          }),
        ],
      }),
      settings({ horizonMonths: 4 }),
    );
    expect(result.metrics.moveReady?.ready).toBe(false);
    expect(result.metrics.moveReady?.gap).toBe(d(800));
  });

  it('is null when no move is planned', () => {
    expect(runForecast(plan(), settings()).metrics.moveReady).toBeNull();
  });
});

describe('trip affordability', () => {
  it('reports only goals that actually have trip payments attached', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(5000) }),
        goals: [
          goal({ id: 'nyc', name: 'NYC trip', targetAmount: d(1200), targetMonth: '2026-11' }),
          goal({ id: 'other', name: 'Not a trip', targetAmount: d(500), targetMonth: '2026-11' }),
        ],
        items: [
          item({
            id: 'pay',
            kind: 'trip_payment',
            amount: d(400),
            goalId: 'nyc',
            startMonth: '2026-09',
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 4 }),
    );
    expect(result.metrics.tripAffordability).toHaveLength(1);
    const nyc = result.metrics.tripAffordability[0];
    expect(nyc?.goalId).toBe('nyc');
    // three payments of 400 by Nov = 1200 -> fully funded
    expect(nyc?.affordable).toBe(true);
    expect(nyc?.gap).toBe(ZERO);
  });
});

describe('potentially exposed amount', () => {
  it('is committed near-term money minus cash and near-cash, never negative', () => {
    const { plan: p, settings: s } = demoPlan();
    const result = runForecast(p, s);
    // required bills 11*1500 + 7*300 = 18600; emergency 4500; move 0; goal gap 3000
    // committed 26100 - (5000 cash + 4000 near-cash) = 17100
    expect(result.metrics.potentiallyExposedAmount).toBe(d(17100));
  });

  it('is zero when cash comfortably covers everything committed', () => {
    const result = runForecast(
      plan({ accounts: standardAccounts({ savings: d(500000) }) }),
      settings({ horizonMonths: 3, emergencyTargetMode: 'fixed', emergencyTarget: d(1000) }),
    );
    expect(result.metrics.potentiallyExposedAmount).toBe(ZERO);
  });
});
