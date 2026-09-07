import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import { runForecast } from '../index';
import { resolvePlan } from '../scenario';
import { seedPlan, seedScenarios, seedSettings } from '../../store/seed';
import { ACC, d, demoPlan, goal, housing, item, plan, settings, standardAccounts } from './fixtures';

/**
 * The numbers in this file are worked out by hand in the comments so a future change that
 * shifts the math fails loudly instead of quietly producing different money.
 */
describe('the demo plan across all 18 months', () => {
  const { plan: p, settings: s } = demoPlan();
  const result = runForecast(p, s);

  it('produces exactly 18 consecutive months with no input warnings', () => {
    expect(result.months).toHaveLength(18);
    expect(result.months[0]?.month).toBe('2026-09');
    expect(result.months[10]?.month).toBe('2027-07');
    expect(result.months[17]?.month).toBe('2028-02');
    expect(result.warnings).toEqual([]);
  });

  it('opening balances match the confirmed account balances', () => {
    // checking 3000 + savings 2000 = 5000 fully liquid; hy 4000 near; go 5000 invested
    expect(result.metrics.fullyLiquid).toBe(d(5000));
    expect(result.metrics.nearLiquid).toBe(d(4000));
    expect(result.metrics.invested).toBe(d(5000));
    expect(result.metrics.totalAssets).toBe(d(14000));
    expect(result.metrics.creditCardDebt).toBe(d(500));
    expect(result.metrics.netWorth).toBe(d(13500));
    // planning funds counts only the $1,000 of Fidelity Go that was approved
    expect(result.metrics.planningFunds).toBe(d(10000));
    expect(result.metrics.immediateBillPayFunds).toBe(d(9000));
  });

  it('protected and flexible funds split correctly at the start', () => {
    // essential goal reserved 1500 + month-1 required outflows 1500 = 3000
    expect(result.metrics.protectedFunds).toBe(d(3000));
    expect(result.metrics.flexibleFunds).toBe(d(7000));
  });

  describe('month by month', () => {
    // While the lease runs: +2000 income, -1200 rent, -300 phone, -200 spending = +300/mo
    // After it ends (2027-08 onward): +2000 - 300 - 200 = +1500/mo
    it('month 1 (Sep 2026) — rent is active, net +300', () => {
      const m = result.months[0]!;
      expect(m.income).toBe(d(2000));
      expect(m.requiredOutflows).toBe(d(1500)); // rent 1200 + phone 300
      expect(m.discretionaryOutflows).toBe(d(200));
      expect(m.openingPlanningFunds).toBe(d(10000));
      expect(m.endingByAccount[ACC.checking]).toBe(d(3300));
      expect(m.endingPlanningFunds).toBe(d(10300));
      expect(m.shortfalls).toEqual([]);
    });

    it('month 11 (Jul 2027) — the last month of the lease', () => {
      const m = result.months[10]!;
      expect(m.month).toBe('2027-07');
      expect(m.requiredOutflows).toBe(d(1500));
      // 3000 + 11 * 300
      expect(m.endingByAccount[ACC.checking]).toBe(d(6300));
    });

    it('month 12 (Aug 2027) — rent disappears, net jumps to +1500', () => {
      const m = result.months[11]!;
      expect(m.month).toBe('2027-08');
      expect(m.requiredOutflows).toBe(d(300));
      expect(m.lineItems.map((li) => li.itemId).sort()).toEqual(['income', 'phone', 'spending']);
      expect(m.endingByAccount[ACC.checking]).toBe(d(7800));
    });

    it('month 18 (Feb 2028) — the end of the horizon', () => {
      const m = result.months[17]!;
      expect(m.month).toBe('2028-02');
      // 6300 + 7 * 1500
      expect(m.endingByAccount[ACC.checking]).toBe(d(16800));
      expect(m.endingFullyLiquid).toBe(d(18800)); // + savings 2000
      expect(m.endingNearLiquid).toBe(d(4000));
      expect(m.endingInvested).toBe(d(5000));
      expect(m.endingPlanningFunds).toBe(d(23800)); // 18800 + 4000 + 1000 approved
      expect(m.endingCreditCardDebt).toBe(d(500));
    });

    it('every month balances: opening + inflows - outflows = ending', () => {
      for (const m of result.months) {
        const expected =
          m.openingPlanningFunds +
          m.income -
          m.requiredOutflows -
          m.discretionaryOutflows -
          m.goalContributions;
        expect(m.endingPlanningFunds).toBe(expected);
      }
    });

    it('every stored amount is an integer number of cents', () => {
      for (const m of result.months) {
        for (const value of Object.values(m.endingByAccount)) {
          expect(Number.isInteger(value)).toBe(true);
        }
        expect(Number.isInteger(m.endingPlanningFunds)).toBe(true);
      }
    });

    it('the invested balance is never touched because nothing forced a sale', () => {
      for (const m of result.months) {
        expect(m.investedDraws).toEqual([]);
        expect(m.endingInvested).toBe(d(5000));
      }
    });
  });

  it('reports exactly one shortfall: the essential goal missing its deadline', () => {
    expect(result.shortfalls).toHaveLength(1);
    const only = result.shortfalls[0]!;
    expect(only.month).toBe('2027-05');
    expect(only.severity).toBe('critical');
    expect(only.category).toBe('goal_funding');
    // target 4500, reserved 1500, nothing ever contributed
    expect(only.amount).toBe(d(3000));
    expect(only.affectedGoalIds).toEqual(['emergency']);
  });

  it('tracks goal progress and the required monthly contribution over time', () => {
    const sep = result.months[0]!.goalProgress[0]!;
    expect(sep.goalId).toBe('emergency');
    expect(sep.gap).toBe(d(3000));
    expect(sep.monthsRemaining).toBe(8); // Sep 2026 -> May 2027
    expect(sep.requiredMonthlyContribution).toBe(d(375)); // 3000 / 8

    const may = result.months.find((m) => m.month === '2027-05')!.goalProgress[0]!;
    expect(may.monthsRemaining).toBe(0);
    // At the deadline the whole remaining gap is due — this is the divide-by-zero guard.
    expect(may.requiredMonthlyContribution).toBe(d(3000));
  });

  it('computes the headline metrics', () => {
    expect(result.metrics.essentialMonthlyOutflow).toBe(d(1500));
    expect(result.metrics.emergencyTarget).toBe(d(4500)); // 3 months of essentials
    expect(result.metrics.runwayMonthsConservative).toBe(6); // 9000 / 1500
    expect(result.metrics.runwayMonthsExpanded).toBe(6.6); // 10000 / 1500, rounded down
    expect(result.metrics.lowestCheckingBalance).toEqual({ month: '2026-09', amount: d(3300) });
    expect(result.metrics.lowestPlanningFunds).toEqual({ month: '2026-09', amount: d(10300) });
    expect(result.metrics.atlantaMoveTarget).toBe(ZERO);
    expect(result.metrics.moveReady).toBeNull();
  });

  it('is deterministic — the same input always produces the same output', () => {
    expect(runForecast(p, s)).toEqual(runForecast(p, s));
  });

  it('never mutates the plan it was given', () => {
    const snapshot = structuredClone(p);
    runForecast(p, s);
    expect(p).toEqual(snapshot);
  });
});

describe('draining accounts when checking goes negative', () => {
  it('drains checking -> savings -> high yield -> approved invested, in that order', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts(
          { checking: d(100), savings: d(200), hy: d(300), go: d(5000) },
          { approved: d(400) },
        ),
        items: [
          item({
            id: 'big',
            kind: 'one_time_expense',
            amount: d(950),
            required: true,
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 1 }),
    );
    const m = result.months[0]!;
    // 950 needed: 100 checking, 200 savings, 300 high yield, then 350 of the 400 approved
    expect(m.endingByAccount[ACC.checking]).toBe(ZERO);
    expect(m.endingByAccount[ACC.savings]).toBe(ZERO);
    expect(m.endingByAccount[ACC.hy]).toBe(ZERO);
    expect(m.endingByAccount[ACC.go]).toBe(d(4650));
    expect(m.investedDraws).toEqual([
      { accountId: ACC.go, amount: d(350), reason: 'the required expense "big"' },
    ]);
    expect(m.shortfalls.map((sh) => sh.category)).toContain('volatility');
  });

  it('NEVER sells more invested money than the user approved', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: ZERO, go: d(50000) }, { approved: d(100) }),
        items: [
          item({
            id: 'big',
            kind: 'one_time_expense',
            amount: d(5000),
            required: true,
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 1 }),
    );
    const m = result.months[0]!;
    expect(m.endingByAccount[ACC.go]).toBe(d(49900)); // only the approved $100 was sold
    expect(m.endingByAccount[ACC.checking]).toBe(d(-4900)); // the rest shows as a real hole
    expect(m.endingPlanningFunds).toBe(d(-4900));
    expect(m.shortfalls.map((sh) => sh.category)).toContain('cash');
  });

  it('the approved pool is consumed once, not re-offered every month', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ go: d(9000) }, { approved: d(500) }),
        items: [
          item({
            id: 'bills',
            kind: 'recurring_expense',
            amount: d(400),
            required: true,
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 3 }),
    );
    // month 1 sells 400, month 2 can only sell the remaining 100, month 3 sells nothing
    expect(result.months[0]?.investedDraws[0]?.amount).toBe(d(400));
    expect(result.months[1]?.investedDraws[0]?.amount).toBe(d(100));
    expect(result.months[2]?.investedDraws).toEqual([]);
    expect(result.months[2]?.endingByAccount[ACC.go]).toBe(d(8500));
  });

  it('a goal contribution cannot sell invested money when the setting forbids it', () => {
    const forbid = runForecast(
      plan({
        accounts: standardAccounts({ go: d(9000) }, { approved: d(5000) }),
        goals: [goal({ id: 'g', targetAmount: d(1000), targetMonth: '2027-06' })],
        items: [
          item({
            id: 'contrib',
            kind: 'goal_contribution',
            amount: d(600),
            goalId: 'g',
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 1, goalsMayReserveInvested: false }),
    );
    expect(forbid.months[0]?.investedDraws).toEqual([]);
    expect(forbid.months[0]?.endingByAccount[ACC.go]).toBe(d(9000));
    expect(forbid.months[0]?.endingByAccount[ACC.checking]).toBe(d(-600));
  });

  it('...and can when the user turns the setting on', () => {
    const allow = runForecast(
      plan({
        accounts: standardAccounts({ go: d(9000) }, { approved: d(5000) }),
        goals: [goal({ id: 'g', targetAmount: d(1000), targetMonth: '2027-06' })],
        items: [
          item({
            id: 'contrib',
            kind: 'goal_contribution',
            amount: d(600),
            goalId: 'g',
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 1, goalsMayReserveInvested: true }),
    );
    expect(allow.months[0]?.endingByAccount[ACC.go]).toBe(d(8400));
    expect(allow.months[0]?.investedDraws[0]?.reason).toContain('funding the goal');
  });
});

describe('transfers, cards and goal contributions', () => {
  it('a transfer moves money without counting as spending', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(3000) }),
        items: [
          item({
            id: 'sweep',
            kind: 'transfer',
            amount: d(500),
            accountId: ACC.checking,
            toAccountId: ACC.hy,
            startMonth: '2026-09',
          }),
        ],
      }),
      settings({ horizonMonths: 2 }),
    );
    const m = result.months[0]!;
    expect(m.requiredOutflows).toBe(ZERO);
    expect(m.discretionaryOutflows).toBe(ZERO);
    expect(m.netTransfers).toBe(d(500));
    expect(m.endingByAccount[ACC.checking]).toBe(d(2500));
    expect(m.endingByAccount[ACC.hy]).toBe(d(500));
    expect(m.endingPlanningFunds).toBe(d(3000)); // unchanged — nothing was spent
  });

  it('spending ON a card raises debt without moving cash this month', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(3000), card: d(500) }),
        items: [
          item({
            id: 'card-spend',
            kind: 'recurring_expense',
            amount: d(250),
            required: false,
            accountId: ACC.card,
          }),
        ],
      }),
      settings({ horizonMonths: 1 }),
    );
    const m = result.months[0]!;
    expect(m.endingByAccount[ACC.checking]).toBe(d(3000));
    expect(m.endingCreditCardDebt).toBe(d(750));
  });

  it('a transfer to a card pays it down and never overpays', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(3000), card: d(500) }),
        items: [
          item({
            id: 'pay-card',
            kind: 'transfer',
            amount: d(800),
            accountId: ACC.checking,
            toAccountId: ACC.card,
          }),
        ],
      }),
      settings({ horizonMonths: 2 }),
    );
    const m1 = result.months[0]!;
    expect(m1.creditCardPayments).toBe(d(500)); // capped at what is actually owed
    expect(m1.endingCreditCardDebt).toBe(ZERO);
    expect(m1.endingByAccount[ACC.checking]).toBe(d(2500));
    // month 2 has nothing left to pay
    expect(result.months[1]?.creditCardPayments).toBe(ZERO);
    expect(result.months[1]?.endingByAccount[ACC.checking]).toBe(d(2500));
  });

  it('goal contributions are capped so a goal never overshoots its target', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(10000) }),
        goals: [
          goal({ id: 'g', targetAmount: d(1000), reservedAmount: d(400), targetMonth: '2027-06' }),
        ],
        items: [
          item({
            id: 'contrib',
            kind: 'goal_contribution',
            amount: d(500),
            goalId: 'g',
            accountId: ACC.checking,
          }),
        ],
      }),
      settings({ horizonMonths: 3 }),
    );
    expect(result.months[0]?.goalContributions).toBe(d(500)); // 400 -> 900
    expect(result.months[1]?.goalContributions).toBe(d(100)); // 900 -> 1000, capped
    expect(result.months[2]?.goalContributions).toBe(ZERO); // full
    expect(result.months[2]?.goalProgress[0]?.reserved).toBe(d(1000));
    expect(result.months[2]?.goalProgress[0]?.gap).toBe(ZERO);
    // only 600 of the 1500 requested ever left checking
    expect(result.months[2]?.endingByAccount[ACC.checking]).toBe(d(9400));
  });

  it('an inactive goal receives nothing', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(10000) }),
        goals: [goal({ id: 'g', targetAmount: d(1000), active: false })],
        items: [
          item({ id: 'c', kind: 'goal_contribution', amount: d(500), goalId: 'g', accountId: ACC.checking }),
        ],
      }),
      settings({ horizonMonths: 1 }),
    );
    expect(result.months[0]?.goalContributions).toBe(ZERO);
    expect(result.months[0]?.goalProgress).toEqual([]);
    expect(result.months[0]?.endingByAccount[ACC.checking]).toBe(d(10000));
  });
});

describe('the full move-in scenario', () => {
  it('lands move-in costs in one month and reports readiness', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(2000), savings: d(6000) }),
        items: [
          item({ id: 'inc', kind: 'income', amount: d(2500), accountId: ACC.checking }),
        ],
        housing: [
          housing({
            id: 'lease',
            label: 'Current lease',
            monthlyRent: d(1200),
            endMonth: '2027-07',
            accountId: ACC.checking,
          }),
          housing({
            id: 'atl',
            label: 'Atlanta apartment',
            monthlyRent: d(1500),
            utilitiesIncluded: false,
            monthlyUtilitiesEstimate: d(160),
            startMonth: '2027-08',
            accountId: ACC.checking,
            moveInCosts: {
              securityDeposit: d(1500),
              firstMonthRent: d(1500),
              applicationFees: d(150),
              utilitySetup: d(200),
              movingTransport: d(600),
              furnitureHousehold: d(1200),
              contingency: d(500),
            },
          }),
        ],
      }),
      settings({ horizonMonths: 18, checkingFloor: d(500) }),
    );

    const moveMonth = result.months.find((m) => m.month === '2027-08')!;
    const lineIds = moveMonth.lineItems.map((li) => li.itemId).sort();
    expect(lineIds).toEqual(['atl::movein', 'atl::rent', 'atl::utilities', 'inc']);
    // rent 1500 + utilities 160 + move-in 5650
    expect(moveMonth.requiredOutflows).toBe(d(7310));
    // move-in fires exactly once
    expect(
      result.months.filter((m) => m.lineItems.some((li) => li.itemId === 'atl::movein')),
    ).toHaveLength(1);

    expect(result.metrics.atlantaMoveTarget).toBe(d(5650));
    expect(result.metrics.moveReady?.targetMonth).toBe('2027-08');
    expect(result.metrics.moveReady?.cost).toBe(d(5650));
  });
});

describe('the shipped seed data', () => {
  it('forecasts cleanly at $0 with no engine warnings', () => {
    const result = runForecast(seedPlan(), seedSettings());
    expect(result.months).toHaveLength(18);
    expect(result.warnings).toEqual([]);
    expect(result.metrics.totalAssets).toBe(ZERO);
    expect(result.metrics.planningFunds).toBe(ZERO);
    expect(result.metrics.runwayMonthsConservative).toBe(Number.POSITIVE_INFINITY);
  });

  it('the only complaint before any real numbers are entered is the $1,000 checking floor', () => {
    // Every seeded amount is $0 on purpose, so an untouched plan sits below the
    // estimated floor. Onboarding collects real balances before this is ever shown.
    const result = runForecast(seedPlan(), seedSettings());
    expect(new Set(result.shortfalls.map((sh) => sh.category))).toEqual(new Set(['cash']));
    expect(result.shortfalls).toHaveLength(18);
  });

  it('with real balances entered, the seed plan is quiet', () => {
    const p = seedPlan();
    p.accounts[0]!.balance = d(6000);
    const result = runForecast(p, seedSettings());
    expect(result.shortfalls).toEqual([]);
  });

  it('all eight starter scenarios resolve and forecast without error', () => {
    const base = seedPlan();
    const baseSnapshot = structuredClone(base);
    const baseSettings = seedSettings();

    for (const scenario of seedScenarios()) {
      const resolved = resolvePlan(base, baseSettings, scenario.overrides);
      const result = runForecast(resolved.plan, resolved.settings);
      expect(result.months, scenario.name).toHaveLength(18);
      expect(result.warnings, scenario.name).toEqual([]);
      expect(result.metrics.essentialMonthlyOutflow, scenario.name).toBe(ZERO);
    }

    // the whole sweep left the baseline plan untouched
    expect(base).toEqual(baseSnapshot);
  });

  it('exactly one scenario is the baseline and it changes nothing', () => {
    const scenarios = seedScenarios();
    expect(scenarios).toHaveLength(8);
    expect(scenarios.filter((sc) => sc.isBaseline)).toHaveLength(1);
    const baseline = scenarios.find((sc) => sc.isBaseline)!;
    expect(baseline.overrides).toEqual({});
  });

  it('scenario overrides actually change the forecast', () => {
    const base = seedPlan();
    // give the baseline some real money so a difference is visible
    base.accounts[0]!.balance = d(5000);
    base.items[0]!.amount = d(2000); // income
    const baseSettings = seedSettings();

    const baseline = runForecast(base, baseSettings);
    const delayed = seedScenarios().find((sc) => sc.id === 'scenario-delayed-employment')!;
    const resolved = resolvePlan(base, baseSettings, delayed.overrides);
    const delayedResult = runForecast(resolved.plan, resolved.settings);

    // income starts 2027-09 in the delayed scenario, so month 1 has no income
    expect(baseline.months[0]?.income).toBe(d(2000));
    expect(delayedResult.months[0]?.income).toBe(ZERO);
  });
});

describe('the engine never throws on bad input', () => {
  it('returns an empty forecast plus a warning for an invalid horizon', () => {
    const result = runForecast(plan(), settings({ startMonth: 'nope' }));
    expect(result.months).toEqual([]);
    expect(result.warnings[0]).toContain('Cannot build a forecast');
    expect(result.shortfalls).toEqual([]);
    expect(result.metrics.totalAssets).toBe(ZERO);
    expect(result.metrics.lowestCheckingBalance.month).toBe('');
  });

  it('survives a plan with no accounts at all', () => {
    const result = runForecast(
      plan({ items: [item({ id: 'x', kind: 'recurring_expense', amount: d(100), required: true })] }),
      settings({ horizonMonths: 2 }),
    );
    expect(result.months).toHaveLength(2);
    expect(Number.isNaN(result.metrics.planningFunds)).toBe(false);
  });

  it('ignores zero-amount items entirely', () => {
    const result = runForecast(
      plan({
        accounts: standardAccounts({ checking: d(1000) }),
        items: [item({ id: 'z', kind: 'recurring_expense', amount: ZERO, required: true })],
      }),
      settings({ horizonMonths: 1 }),
    );
    expect(result.months[0]?.lineItems.find((li) => li.itemId === 'z')?.amount).toBe(ZERO);
    expect(result.months[0]?.requiredOutflows).toBe(ZERO);
  });
});
