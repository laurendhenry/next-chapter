import { ZERO, absCents, clampAtZero } from '../types/money';
import type { PlanItem } from '../types/plan';
import type { ScenarioOverrides } from '../types/scenario';
import type { ScenarioAssumptions } from '../types/assumptions';

/**
 * Turns the three tiny Phase 4A assumptions into an override patch the Phase 1 engine already
 * knows how to resolve (`resolvePlan`). Pure: no engine changes, no baseline mutation.
 *
 * - one-time cost      -> an added `one_time_expense` item in that month
 * - monthly change     -> an added recurring item (expense if positive, income if negative)
 * - income override    -> an `itemPatches` entry on an existing income item
 */
export function assumptionsToOverrides(
  scenarioId: string,
  assumptions: ScenarioAssumptions,
): ScenarioOverrides {
  const addedItems: PlanItem[] = [];
  const overrides: ScenarioOverrides = {};

  const one = assumptions.oneTimeCost;
  if (one.enabled && one.amount !== 0) {
    addedItems.push({
      id: `${scenarioId}:one-time`,
      kind: 'one_time_expense',
      label: one.label || 'One-time cost',
      amount: clampAtZero(one.amount),
      required: true,
      startMonth: one.month,
    });
  }

  const monthly = assumptions.monthlyExpenseChange;
  if (monthly.enabled && monthly.amount !== 0) {
    const isCost = monthly.amount > 0;
    addedItems.push({
      id: `${scenarioId}:monthly`,
      kind: isCost ? 'recurring_expense' : 'income',
      label: monthly.label || (isCost ? 'Higher monthly cost' : 'Lower monthly cost'),
      amount: absCents(monthly.amount),
      required: true,
      startMonth: monthly.startMonth,
      ...(isCost ? {} : { confidence: 'likely' as const }),
    });
  }

  const income = assumptions.incomeOverride;
  if (income.enabled && income.itemId) {
    overrides.itemPatches = {
      [income.itemId]: {
        amount: clampAtZero(income.amount),
        startMonth: income.startMonth,
      },
    };
  }

  if (addedItems.length > 0) overrides.addedItems = addedItems;
  return overrides;
}

/** A scenario with nothing switched on resolves to the baseline. */
export function emptyAssumptions(startMonth: string): ScenarioAssumptions {
  return {
    oneTimeCost: { enabled: false, label: '', amount: ZERO, month: startMonth },
    monthlyExpenseChange: { enabled: false, label: '', amount: ZERO, startMonth },
    incomeOverride: { enabled: false, itemId: '', amount: ZERO, startMonth },
  };
}
