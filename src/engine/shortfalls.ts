import { ZERO, clampAtZero, subCents, type Cents } from '../types/money';
import type { Shortfall } from '../types/forecast';
import type { Account, Goal, Settings } from '../types/plan';
import { totalOfType, type BalanceMap } from './balances';
import { formatMonth } from './months';
import type { InvestedDraw } from '../types/forecast';

/**
 * The eight levers from brief §6E. These are DISPLAY ONLY — the engine never applies one.
 */
export const LEVERS = {
  increaseIncome: 'Increase the income assumption.',
  lowerExpense: 'Lower an expense budget.',
  reduceTrip: 'Reduce a trip cost.',
  deferGoal: 'Delay or defer an optional goal.',
  changeHousing: 'Change future housing assumptions.',
  adjustDate: 'Adjust the target date.',
  useNearLiquid: 'Explicitly use near-liquid or invested funds.',
  changeAllocation: 'Change the target allocation between cash and investments.',
} as const;

export type ShortfallContext = {
  month: string;
  accounts: readonly Account[];
  settings: Settings;
  /** Balances at the END of the month, after everything has been applied. */
  endingBalances: BalanceMap;
  endingPlanningFunds: Cents;
  endingBillPayFunds: Cents;
  /** Bill-pay money actually available during the month: opening bill-pay + income. */
  availableBillPayDuringMonth: Cents;
  requiredOutflows: Cents;
  creditCardPayments: Cents;
  goals: readonly Goal[];
  reserved: Record<string, Cents>;
  investedDraws: readonly InvestedDraw[];
  /** Labels of the items that pushed this month negative — used for the `cause` sentence. */
  largestRequiredItemLabel: string | null;
};

const id = (month: string, rule: string, subject = 'x') => `${month}:${rule}:${subject}`;

/** Rule 1 — projected checking falls below the user's checking floor. */
export function ruleCheckingFloor(ctx: ShortfallContext): Shortfall[] {
  const checking = totalOfType(ctx.accounts, ctx.endingBalances, 'checking');
  const floor = ctx.settings.checkingFloor;
  if (checking >= floor) return [];
  const checkingIds = ctx.accounts.filter((a) => a.type === 'checking').map((a) => a.id);
  return [
    {
      id: id(ctx.month, 'checking_floor'),
      month: ctx.month,
      severity: 'critical',
      category: 'cash',
      amount: subCents(floor, checking),
      title: 'Checking falls below your floor',
      cause:
        `In ${formatMonth(ctx.month)} projected checking ends below the $` +
        `${(floor / 100).toFixed(2)} floor you set` +
        (ctx.largestRequiredItemLabel
          ? `, mostly driven by "${ctx.largestRequiredItemLabel}".`
          : '.'),
      affectedGoalIds: [],
      affectedAccountIds: checkingIds,
      suggestedLevers: [LEVERS.lowerExpense, LEVERS.increaseIncome, LEVERS.useNearLiquid],
    },
  ];
}

/** Rule 2 — money that can actually reach a biller in time is less than the month's bills. */
export function ruleBillPayTiming(ctx: ShortfallContext): Shortfall[] {
  if (ctx.availableBillPayDuringMonth >= ctx.requiredOutflows) return [];
  const delayed = ctx.accounts
    .filter((a) => a.type === 'high_yield' || a.type === 'invested')
    .map((a) => a.id);
  return [
    {
      id: id(ctx.month, 'bill_pay_timing'),
      month: ctx.month,
      severity: 'critical',
      category: 'timing',
      amount: subCents(ctx.requiredOutflows, ctx.availableBillPayDuringMonth),
      title: 'Required bills exceed money that can arrive in time',
      cause:
        `${formatMonth(ctx.month)} needs more for required bills than the checking, savings and ` +
        'transfer-eligible high-yield money available during the month, so covering it depends ' +
        'on funds that may not land in time.',
      affectedGoalIds: [],
      affectedAccountIds: delayed,
      suggestedLevers: [LEVERS.useNearLiquid, LEVERS.lowerExpense, LEVERS.adjustDate],
    },
  ];
}

/** Rule 3 — projected planning funds go negative. The plan does not fund itself. */
export function rulePlanningFundsNegative(ctx: ShortfallContext): Shortfall[] {
  if (ctx.endingPlanningFunds >= 0) return [];
  return [
    {
      id: id(ctx.month, 'planning_funds_negative'),
      month: ctx.month,
      severity: 'critical',
      category: 'cash',
      amount: clampAtZero(subCents(ZERO, ctx.endingPlanningFunds)),
      title: 'Planning funds run out',
      cause:
        `${formatMonth(ctx.month)} spends more than all available planning funds, including ` +
        'every dollar of invested money you have approved for use.',
      affectedGoalIds: [],
      affectedAccountIds: ctx.accounts.map((a) => a.id),
      suggestedLevers: [
        LEVERS.increaseIncome,
        LEVERS.lowerExpense,
        LEVERS.deferGoal,
        LEVERS.changeHousing,
      ],
    },
  ];
}

function goalUnderfunded(ctx: ShortfallContext, goal: Goal): Cents | null {
  if (!goal.active) return null;
  if (goal.targetMonth !== ctx.month) return null;
  const held = ctx.reserved[goal.id] ?? goal.reservedAmount;
  const gap = clampAtZero(subCents(goal.targetAmount, held));
  return gap > 0 ? gap : null;
}

/** Rule 4 — an ESSENTIAL goal is short at its deadline. */
export function ruleEssentialGoalUnderfunded(ctx: ShortfallContext): Shortfall[] {
  const out: Shortfall[] = [];
  for (const goal of ctx.goals) {
    if (goal.priority !== 'essential') continue;
    const gap = goalUnderfunded(ctx, goal);
    if (gap === null) continue;
    out.push({
      id: id(ctx.month, 'essential_goal_underfunded', goal.id),
      month: ctx.month,
      severity: 'critical',
      category: 'goal_funding',
      amount: gap,
      title: `${goal.name} is underfunded at its deadline`,
      cause:
        `"${goal.name}" is an essential goal due ${formatMonth(goal.targetMonth)} and is ` +
        `projected to be short at that point.`,
      affectedGoalIds: [goal.id],
      affectedAccountIds: goal.preferredAccountId ? [goal.preferredAccountId] : [],
      suggestedLevers: [LEVERS.increaseIncome, LEVERS.lowerExpense, LEVERS.adjustDate],
    });
  }
  return out;
}

/** Rule 5 — an important or optional goal is short at its deadline. */
export function ruleOtherGoalUnderfunded(ctx: ShortfallContext): Shortfall[] {
  const out: Shortfall[] = [];
  for (const goal of ctx.goals) {
    if (goal.priority === 'essential') continue;
    const gap = goalUnderfunded(ctx, goal);
    if (gap === null) continue;
    out.push({
      id: id(ctx.month, 'goal_underfunded', goal.id),
      month: ctx.month,
      severity: 'warning',
      category: 'goal_funding',
      amount: gap,
      title: `${goal.name} is underfunded at its deadline`,
      cause:
        `"${goal.name}" (${goal.priority}, ${goal.flexibility}) is due ` +
        `${formatMonth(goal.targetMonth)} and is projected to be short at that point.`,
      affectedGoalIds: [goal.id],
      affectedAccountIds: goal.preferredAccountId ? [goal.preferredAccountId] : [],
      suggestedLevers: [LEVERS.reduceTrip, LEVERS.deferGoal, LEVERS.adjustDate],
    });
  }
  return out;
}

/** Rule 6 — the month relied on selling market-exposed funds. */
export function ruleInvestedDraw(ctx: ShortfallContext): Shortfall[] {
  if (ctx.investedDraws.length === 0) return [];
  let total = 0;
  const accountIds: string[] = [];
  const reasons: string[] = [];
  for (const draw of ctx.investedDraws) {
    total += draw.amount;
    if (!accountIds.includes(draw.accountId)) accountIds.push(draw.accountId);
    if (!reasons.includes(draw.reason)) reasons.push(draw.reason);
  }
  if (total <= 0) return [];
  const names = accountIds
    .map((accountId) => ctx.accounts.find((a) => a.id === accountId)?.name ?? accountId)
    .join(', ');
  return [
    {
      id: id(ctx.month, 'invested_draw'),
      month: ctx.month,
      severity: 'warning',
      category: 'volatility',
      amount: total as Cents,
      title: 'This month relies on market-exposed money',
      cause:
        `${formatMonth(ctx.month)} relies on $${(total / 100).toFixed(2)} from ${names} ` +
        `for ${reasons.join(' and ')}. That money is exposed to market movement, so the ` +
        'amount actually available may differ.',
      affectedGoalIds: [],
      affectedAccountIds: accountIds,
      suggestedLevers: [LEVERS.changeAllocation, LEVERS.lowerExpense, LEVERS.adjustDate],
    },
  ];
}

/** Rule 7 — the forecast credit-card payment is bigger than money that can reach the card. */
export function ruleCreditCardPayment(ctx: ShortfallContext): Shortfall[] {
  if (ctx.creditCardPayments <= 0) return [];
  if (ctx.creditCardPayments <= ctx.availableBillPayDuringMonth) return [];
  const cardIds = ctx.accounts.filter((a) => a.type === 'credit_card').map((a) => a.id);
  return [
    {
      id: id(ctx.month, 'credit_card_payment'),
      month: ctx.month,
      severity: 'critical',
      category: 'credit',
      amount: subCents(ctx.creditCardPayments, ctx.availableBillPayDuringMonth),
      title: 'Card payment exceeds money that can arrive in time',
      cause:
        `The projected card payment in ${formatMonth(ctx.month)} is larger than the checking, ` +
        'savings and transfer-eligible high-yield money available that month.',
      affectedGoalIds: [],
      affectedAccountIds: cardIds,
      suggestedLevers: [LEVERS.lowerExpense, LEVERS.increaseIncome, LEVERS.useNearLiquid],
    },
  ];
}

export const RULES = [
  ruleCheckingFloor,
  ruleBillPayTiming,
  rulePlanningFundsNegative,
  ruleEssentialGoalUnderfunded,
  ruleOtherGoalUnderfunded,
  ruleInvestedDraw,
  ruleCreditCardPayment,
] as const;

export function evaluateShortfalls(ctx: ShortfallContext): Shortfall[] {
  return RULES.flatMap((rule) => rule(ctx));
}
