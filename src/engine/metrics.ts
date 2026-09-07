import {
  ZERO,
  addCents,
  cents,
  clampAtZero,
  divCentsFloor,
  subCents,
  sumCents,
  type Cents,
} from '../types/money';
import type {
  ForecastMetrics,
  LowestPoint,
  MonthResult,
  MoveReadiness,
  TripAffordability,
} from '../types/forecast';
import type { Plan, Settings } from '../types/plan';
import { computeBuckets, openingBalances, totalOfType, type BalanceBuckets } from './balances';
import { totalMoveInCost } from './items';
import { compareMonths, isOnOrBefore } from './months';

/** Average required outflow over the first N months. The denominator is always > 0. */
export function essentialMonthlyOutflow(months: readonly MonthResult[], window = 3): Cents {
  if (months.length === 0) return ZERO;
  const slice = months.slice(0, Math.max(1, Math.min(window, months.length)));
  const total = sumCents(slice.map((m) => m.requiredOutflows));
  return divCentsFloor(total, slice.length);
}

/**
 * Runway in months. Rounded DOWN to one decimal so it is never optimistic.
 * `Infinity` when there are no essential outflows at all (nothing to run out against).
 */
export function runwayMonths(available: Cents, monthlyBurn: Cents): number {
  if (monthlyBurn <= 0) return Number.POSITIVE_INFINITY;
  if (available <= 0) return 0;
  return Math.floor((available / monthlyBurn) * 10) / 10;
}

function lowest(
  months: readonly MonthResult[],
  pick: (m: MonthResult) => Cents,
  fallback: Cents,
): LowestPoint {
  if (months.length === 0) return { month: '', amount: fallback };
  let best = months[0] as MonthResult;
  let bestValue = pick(best);
  for (const m of months) {
    const value = pick(m);
    if (value < bestValue) {
      best = m;
      bestValue = value;
    }
  }
  return { month: best.month, amount: bestValue };
}

/** Emergency target, resolved from either the fixed amount or N months of essentials. */
export function resolveEmergencyTarget(settings: Settings, burn: Cents): Cents {
  if (settings.emergencyTargetMode === 'months_of_essentials') {
    const n = settings.emergencyTargetMonths ?? 3;
    return cents(burn * Math.max(0, n));
  }
  return clampAtZero(settings.emergencyTarget);
}

/** Σ of move-in costs for every housing assumption starting inside the horizon. */
export function atlantaMoveTarget(plan: Plan, months: readonly string[]): Cents {
  const last = months[months.length - 1];
  const first = months[0];
  if (!last || !first) return ZERO;
  let total = 0;
  for (const housing of plan.housing) {
    if (compareMonths(housing.startMonth, first) < 0) continue;
    if (!isOnOrBefore(housing.startMonth, last)) continue;
    total += totalMoveInCost(housing);
  }
  return cents(total);
}

function moveReadiness(
  plan: Plan,
  months: readonly MonthResult[],
  openingPlanning: Cents,
): MoveReadiness | null {
  const horizonEnd = months[months.length - 1]?.month;
  if (!horizonEnd) return null;
  const candidates = plan.housing
    .filter((h) => totalMoveInCost(h) > 0 && isOnOrBefore(h.startMonth, horizonEnd))
    .sort((a, b) => compareMonths(a.startMonth, b.startMonth));
  const housing = candidates[0];
  if (!housing) return null;

  const cost = totalMoveInCost(housing);
  const index = months.findIndex((m) => m.month === housing.startMonth);
  // Money on hand the month BEFORE the move lands.
  const available =
    index <= 0 ? openingPlanning : ((months[index - 1] as MonthResult).endingPlanningFunds ?? ZERO);
  const gap = clampAtZero(subCents(cost, available));
  return {
    housingId: housing.id,
    label: housing.label,
    targetMonth: housing.startMonth,
    cost,
    available,
    ready: gap === 0,
    gap,
  };
}

function tripAffordability(plan: Plan, months: readonly MonthResult[]): TripAffordability[] {
  const tripGoalIds = new Set(
    plan.items.filter((i) => i.kind === 'trip_payment' && i.goalId).map((i) => i.goalId as string),
  );
  const out: TripAffordability[] = [];
  for (const goal of plan.goals) {
    if (!goal.active || !tripGoalIds.has(goal.id)) continue;
    // Reserved amount as of the goal's deadline, or the end of the horizon if it is later.
    const atDeadline =
      months.find((m) => m.month === goal.targetMonth) ?? months[months.length - 1];
    const progress = atDeadline?.goalProgress.find((p) => p.goalId === goal.id);
    const reserved = progress?.reserved ?? goal.reservedAmount;
    const gap = clampAtZero(subCents(goal.targetAmount, reserved));
    out.push({
      goalId: goal.id,
      name: goal.name,
      targetMonth: goal.targetMonth,
      affordable: gap === 0,
      gap,
    });
  }
  return out;
}

export type MetricsInput = {
  plan: Plan;
  settings: Settings;
  months: readonly MonthResult[];
  monthKeys: readonly string[];
  openingBuckets: BalanceBuckets;
  openingProtected: Cents;
  openingFlexible: Cents;
};

export function computeMetrics(input: MetricsInput): ForecastMetrics {
  const { plan, settings, months, monthKeys, openingBuckets } = input;
  const burn = essentialMonthlyOutflow(months);
  const emergencyTarget = resolveEmergencyTarget(settings, burn);
  const moveTarget = atlantaMoveTarget(plan, monthKeys);
  const horizonEnd = monthKeys[monthKeys.length - 1] ?? '';

  /**
   * Required bills across the horizon, EXCLUDING synthetic move-in cost lines.
   * Move-in cost is added separately as `atlantaMoveTarget`; counting it in both places
   * would double-count roughly $8k of exposure. (Documented in docs/calculations.md.)
   */
  const requiredBills = sumCents(
    months.map((m) =>
      sumCents(
        m.lineItems
          .filter((li) => li.required && li.kind !== 'income' && li.kind !== 'transfer')
          .filter((li) => !li.itemId.endsWith('::movein'))
          .map((li) => li.amount),
      ),
    ),
  );

  const goalTargetsInHorizon = sumCents(
    plan.goals
      .filter((g) => g.active && isOnOrBefore(g.targetMonth, horizonEnd))
      .map((g) => clampAtZero(subCents(g.targetAmount, g.reservedAmount))),
  );

  const nearTermCommitted = addCents(
    requiredBills,
    emergencyTarget,
    moveTarget,
    goalTargetsInHorizon,
  );

  const cashAndNearCash = addCents(openingBuckets.fullyLiquid, openingBuckets.nearLiquid);
  const potentiallyExposedAmount = clampAtZero(subCents(nearTermCommitted, cashAndNearCash));

  const openingChecking = totalOfType(plan.accounts, openingBalances(plan.accounts), 'checking');

  return {
    totalAssets: openingBuckets.totalAssets,
    fullyLiquid: openingBuckets.fullyLiquid,
    nearLiquid: openingBuckets.nearLiquid,
    invested: openingBuckets.invested,
    creditCardDebt: openingBuckets.creditCardDebt,
    netWorth: openingBuckets.netWorth,
    planningFunds: openingBuckets.planningFunds,
    immediateBillPayFunds: openingBuckets.immediateBillPayFunds,
    protectedFunds: input.openingProtected,
    flexibleFunds: input.openingFlexible,
    lowestCheckingBalance: lowest(
      months,
      (m) => totalOfType(plan.accounts, m.endingByAccount, 'checking'),
      openingChecking,
    ),
    lowestBillPayBalance: lowest(months, (m) => m.endingBillPayFunds, openingBuckets.immediateBillPayFunds),
    lowestPlanningFunds: lowest(months, (m) => m.endingPlanningFunds, openingBuckets.planningFunds),
    runwayMonthsConservative: runwayMonths(cashAndNearCash, burn),
    runwayMonthsExpanded: runwayMonths(openingBuckets.planningFunds, burn),
    essentialMonthlyOutflow: burn,
    atlantaMoveTarget: moveTarget,
    emergencyTarget,
    potentiallyExposedAmount,
    moveReady: moveReadiness(plan, months, openingBuckets.planningFunds),
    tripAffordability: tripAffordability(plan, months),
  };
}

export { computeBuckets };
