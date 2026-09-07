import { describe, expect, it } from 'vitest';
import { ZERO, type Cents } from '../../types/money';
import type { Shortfall } from '../../types/forecast';
import {
  LEVERS,
  evaluateShortfalls,
  ruleBillPayTiming,
  ruleCheckingFloor,
  ruleCreditCardPayment,
  ruleEssentialGoalUnderfunded,
  ruleInvestedDraw,
  ruleOtherGoalUnderfunded,
  rulePlanningFundsNegative,
  type ShortfallContext,
} from '../shortfalls';
import { ACC, d, goal, settings, standardAccounts } from './fixtures';

function ctx(overrides: Partial<ShortfallContext> = {}): ShortfallContext {
  return {
    month: '2027-01',
    accounts: standardAccounts(),
    settings: settings(),
    endingBalances: {},
    endingPlanningFunds: d(5000),
    endingBillPayFunds: d(5000),
    availableBillPayDuringMonth: d(5000),
    requiredOutflows: d(1000),
    creditCardPayments: ZERO,
    goals: [],
    reserved: {},
    investedDraws: [],
    largestRequiredItemLabel: null,
    ...overrides,
  };
}

const ids = (s: Shortfall[]) => s.map((x) => x.id);

describe('rule 1 — checking below the floor', () => {
  it('fires with the exact shortfall amount', () => {
    const result = ruleCheckingFloor(
      ctx({
        settings: settings({ checkingFloor: d(1000) }),
        endingBalances: { [ACC.checking]: d(250) },
        largestRequiredItemLabel: 'Rent',
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('critical');
    expect(result[0]?.category).toBe('cash');
    expect(result[0]?.amount).toBe(d(750));
    expect(result[0]?.cause).toContain('Rent');
    expect(result[0]?.affectedAccountIds).toContain(ACC.checking);
    expect(result[0]?.suggestedLevers).toContain(LEVERS.lowerExpense);
  });

  it('does not fire exactly at the floor', () => {
    expect(
      ruleCheckingFloor(
        ctx({ settings: settings({ checkingFloor: d(1000) }), endingBalances: { checking: d(1000) } }),
      ),
    ).toEqual([]);
  });

  it('fires on a negative checking balance too', () => {
    const result = ruleCheckingFloor(
      ctx({ settings: settings({ checkingFloor: d(1000) }), endingBalances: { checking: d(-200) } }),
    );
    expect(result[0]?.amount).toBe(d(1200));
  });
});

describe('rule 2 — bill-pay timing', () => {
  it('fires when required bills exceed money that can arrive in time', () => {
    const result = ruleBillPayTiming(
      ctx({ availableBillPayDuringMonth: d(800), requiredOutflows: d(1500) }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe('timing');
    expect(result[0]?.severity).toBe('critical');
    expect(result[0]?.amount).toBe(d(700));
  });

  it('does not fire when the money is there', () => {
    expect(
      ruleBillPayTiming(ctx({ availableBillPayDuringMonth: d(1500), requiredOutflows: d(1500) })),
    ).toEqual([]);
  });
});

describe('rule 3 — planning funds go negative', () => {
  it('fires with the size of the hole', () => {
    const result = rulePlanningFundsNegative(ctx({ endingPlanningFunds: d(-425) }));
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe(d(425));
    expect(result[0]?.severity).toBe('critical');
    expect(result[0]?.suggestedLevers).toContain(LEVERS.deferGoal);
  });

  it('does not fire at exactly zero', () => {
    expect(rulePlanningFundsNegative(ctx({ endingPlanningFunds: ZERO }))).toEqual([]);
  });
});

describe('rules 4 and 5 — underfunded goals at their deadline', () => {
  const essential = goal({
    id: 'move',
    name: 'Atlanta move fund',
    priority: 'essential',
    targetAmount: d(6000),
    targetMonth: '2027-01',
  });
  const optional = goal({
    id: 'cruise',
    name: 'Cruise',
    priority: 'optional',
    targetAmount: d(2200),
    targetMonth: '2027-01',
  });

  it('rule 4 flags an essential goal as CRITICAL', () => {
    const result = ruleEssentialGoalUnderfunded(
      ctx({ goals: [essential], reserved: { move: d(4900) } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('critical');
    expect(result[0]?.category).toBe('goal_funding');
    expect(result[0]?.amount).toBe(d(1100));
    expect(result[0]?.affectedGoalIds).toEqual(['move']);
  });

  it('rule 5 flags a non-essential goal as a WARNING', () => {
    const result = ruleOtherGoalUnderfunded(
      ctx({ goals: [optional], reserved: { cruise: d(1000) } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('warning');
    expect(result[0]?.amount).toBe(d(1200));
    expect(result[0]?.suggestedLevers).toContain(LEVERS.reduceTrip);
  });

  it('the two rules never both fire for the same goal', () => {
    const c = ctx({ goals: [essential, optional], reserved: {} });
    const a = ruleEssentialGoalUnderfunded(c);
    const b = ruleOtherGoalUnderfunded(c);
    expect(a.map((s) => s.affectedGoalIds[0])).toEqual(['move']);
    expect(b.map((s) => s.affectedGoalIds[0])).toEqual(['cruise']);
  });

  it('is silent in every month except the deadline month', () => {
    const c = ctx({ month: '2026-12', goals: [essential, optional], reserved: {} });
    expect(ruleEssentialGoalUnderfunded(c)).toEqual([]);
    expect(ruleOtherGoalUnderfunded(c)).toEqual([]);
  });

  it('is silent for a fully funded goal and for an inactive goal', () => {
    expect(
      ruleEssentialGoalUnderfunded(ctx({ goals: [essential], reserved: { move: d(6000) } })),
    ).toEqual([]);
    expect(
      ruleEssentialGoalUnderfunded(
        ctx({ goals: [{ ...essential, active: false }], reserved: {} }),
      ),
    ).toEqual([]);
  });
});

describe('rule 6 — relying on market-exposed money', () => {
  it('aggregates every draw in the month into one warning', () => {
    const result = ruleInvestedDraw(
      ctx({
        investedDraws: [
          { accountId: ACC.go, amount: d(400), reason: 'the required expense "Rent"' },
          { accountId: ACC.go, amount: d(200), reason: 'move-in costs' },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('warning');
    expect(result[0]?.category).toBe('volatility');
    expect(result[0]?.amount).toBe(d(600));
    expect(result[0]?.cause).toContain('Fidelity Go');
    expect(result[0]?.cause).toContain('move-in costs');
    expect(result[0]?.affectedAccountIds).toEqual([ACC.go]);
    expect(result[0]?.suggestedLevers).toContain(LEVERS.changeAllocation);
  });

  it('is silent when nothing was sold', () => {
    expect(ruleInvestedDraw(ctx({ investedDraws: [] }))).toEqual([]);
    expect(
      ruleInvestedDraw(ctx({ investedDraws: [{ accountId: ACC.go, amount: ZERO, reason: 'x' }] })),
    ).toEqual([]);
  });
});

describe('rule 7 — card payment bigger than reachable money', () => {
  it('fires with the gap', () => {
    const result = ruleCreditCardPayment(
      ctx({ creditCardPayments: d(1200), availableBillPayDuringMonth: d(500) }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe('credit');
    expect(result[0]?.severity).toBe('critical');
    expect(result[0]?.amount).toBe(d(700));
    expect(result[0]?.affectedAccountIds).toContain(ACC.card);
  });

  it('is silent when there is no card payment or the money is there', () => {
    expect(ruleCreditCardPayment(ctx({ creditCardPayments: ZERO }))).toEqual([]);
    expect(
      ruleCreditCardPayment(
        ctx({ creditCardPayments: d(400), availableBillPayDuringMonth: d(500) }),
      ),
    ).toEqual([]);
  });
});

describe('a single bad month can fire several rules at once', () => {
  it('reports every rule that applies, each with a distinct id', () => {
    const result = evaluateShortfalls(
      ctx({
        month: '2027-08',
        settings: settings({ checkingFloor: d(1000) }),
        endingBalances: { [ACC.checking]: d(-300) },
        endingPlanningFunds: d(-1500),
        availableBillPayDuringMonth: d(200),
        requiredOutflows: d(3000),
        creditCardPayments: d(900),
        goals: [
          goal({ id: 'move', priority: 'essential', targetAmount: d(6000), targetMonth: '2027-08' }),
          goal({ id: 'nyc', priority: 'optional', targetAmount: d(1200), targetMonth: '2027-08' }),
        ],
        reserved: { move: d(2000), nyc: ZERO },
        investedDraws: [{ accountId: ACC.go, amount: d(1000) as Cents, reason: 'move-in costs' }],
      }),
    );

    expect(result).toHaveLength(7);
    expect(new Set(ids(result)).size).toBe(7);
    expect(result.every((s) => s.month === '2027-08')).toBe(true);
    expect(result.filter((s) => s.severity === 'critical')).toHaveLength(5);
    expect(result.filter((s) => s.severity === 'warning')).toHaveLength(2);
    expect(new Set(result.map((s) => s.category))).toEqual(
      new Set(['cash', 'timing', 'goal_funding', 'volatility', 'credit']),
    );
  });

  it('a healthy month produces nothing at all', () => {
    expect(evaluateShortfalls(ctx())).toEqual([]);
  });

  it('every shortfall id is deterministic across repeated runs', () => {
    const c = ctx({ endingPlanningFunds: d(-100) });
    expect(ids(evaluateShortfalls(c))).toEqual(ids(evaluateShortfalls(c)));
  });

  it('every shortfall carries a plain-English cause and at least one lever', () => {
    const result = evaluateShortfalls(
      ctx({
        settings: settings({ checkingFloor: d(1000) }),
        endingBalances: { [ACC.checking]: ZERO },
        endingPlanningFunds: d(-100),
      }),
    );
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(s.cause.length).toBeGreaterThan(20);
      expect(s.suggestedLevers.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});
