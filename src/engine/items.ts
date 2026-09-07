import { ZERO, addCents, type Cents } from '../types/money';
import type { HousingAssumption, ItemKind, Plan, PlanItem } from '../types/plan';
import { isOnOrAfter, isOnOrBefore, isValidMonthKey, monthDiff } from './months';

/** A plan item flattened onto one specific month. */
export type ResolvedItem = {
  itemId: string;
  label: string;
  kind: ItemKind;
  amount: Cents;
  required: boolean;
  accountId?: string;
  toAccountId?: string;
  goalId?: string;
  /** Set when this item was synthesised from a HousingAssumption. */
  housingId?: string;
  /** Set for the one-time move-in cost line, used by the move-readiness metric. */
  isMoveInCost?: boolean;
};

export type ExpansionResult = {
  byMonth: Map<string, ResolvedItem[]>;
  warnings: string[];
};

const everyN = (item: PlanItem): number => {
  const n = item.everyNMonths ?? 1;
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
};

/** Does this item produce a line in `month`? */
export function occursIn(item: PlanItem, month: string): boolean {
  if (!isValidMonthKey(item.startMonth) || !isValidMonthKey(month)) return false;
  if (!isOnOrAfter(month, item.startMonth)) return false;
  if (item.endMonth && isValidMonthKey(item.endMonth) && !isOnOrBefore(month, item.endMonth)) {
    return false;
  }
  // A one-time expense fires exactly once, at its start month.
  if (item.kind === 'one_time_expense') return month === item.startMonth;
  const diff = monthDiff(item.startMonth, month);
  if (diff === null) return false;
  return diff % everyN(item) === 0;
}

export function totalMoveInCost(housing: HousingAssumption): Cents {
  const c = housing.moveInCosts;
  if (!c) return ZERO;
  return addCents(
    c.securityDeposit,
    c.firstMonthRent,
    c.applicationFees,
    c.utilitySetup,
    c.movingTransport,
    c.furnitureHousehold,
    c.contingency,
  );
}

/**
 * Housing is not stored as plan items — it is a higher-level assumption that expands into
 * up to three synthetic items so the rest of the engine only ever deals with PlanItems.
 */
export function housingToItems(housing: HousingAssumption): PlanItem[] {
  const out: PlanItem[] = [];
  if (housing.monthlyRent > 0) {
    out.push({
      id: `${housing.id}::rent`,
      kind: 'recurring_expense',
      label: `${housing.label} — rent`,
      amount: housing.monthlyRent,
      required: true,
      startMonth: housing.startMonth,
      ...(housing.endMonth ? { endMonth: housing.endMonth } : {}),
      ...(housing.accountId ? { accountId: housing.accountId } : {}),
    });
  }
  const utilities = housing.monthlyUtilitiesEstimate ?? ZERO;
  if (!housing.utilitiesIncluded && utilities > 0) {
    out.push({
      id: `${housing.id}::utilities`,
      kind: 'recurring_expense',
      label: `${housing.label} — utilities`,
      amount: utilities,
      required: true,
      startMonth: housing.startMonth,
      ...(housing.endMonth ? { endMonth: housing.endMonth } : {}),
      ...(housing.accountId ? { accountId: housing.accountId } : {}),
    });
  }
  const moveIn = totalMoveInCost(housing);
  if (moveIn > 0) {
    out.push({
      id: `${housing.id}::movein`,
      kind: 'one_time_expense',
      label: `${housing.label} — move-in costs`,
      amount: moveIn,
      required: true,
      startMonth: housing.startMonth,
      ...(housing.accountId ? { accountId: housing.accountId } : {}),
    });
  }
  return out;
}

function toResolved(item: PlanItem, housingId?: string): ResolvedItem {
  return {
    itemId: item.id,
    label: item.label,
    kind: item.kind,
    amount: item.amount,
    required: item.required,
    ...(item.accountId ? { accountId: item.accountId } : {}),
    ...(item.toAccountId ? { toAccountId: item.toAccountId } : {}),
    ...(item.goalId ? { goalId: item.goalId } : {}),
    ...(housingId ? { housingId } : {}),
    ...(item.id.endsWith('::movein') ? { isMoveInCost: true } : {}),
  };
}

/** Flatten every plan item and housing assumption onto the months of the horizon. */
export function expandItems(plan: Plan, months: readonly string[]): ExpansionResult {
  const warnings: string[] = [];
  const byMonth = new Map<string, ResolvedItem[]>();
  for (const m of months) byMonth.set(m, []);

  const accountIds = new Set(plan.accounts.map((a) => a.id));
  const goalIds = new Set(plan.goals.map((g) => g.id));

  const push = (item: PlanItem, housingId?: string) => {
    if (!isValidMonthKey(item.startMonth)) {
      warnings.push(`Item "${item.label}" has an invalid start month "${item.startMonth}".`);
      return;
    }
    if (item.amount < 0) {
      warnings.push(`Item "${item.label}" has a negative amount; amounts must be positive.`);
    }
    if (item.accountId && !accountIds.has(item.accountId)) {
      warnings.push(`Item "${item.label}" points at an account that no longer exists.`);
    }
    if (item.toAccountId && !accountIds.has(item.toAccountId)) {
      warnings.push(`Transfer "${item.label}" points at a destination account that no longer exists.`);
    }
    if (item.goalId && !goalIds.has(item.goalId)) {
      warnings.push(`Item "${item.label}" points at a goal that no longer exists.`);
    }
    for (const month of months) {
      if (!occursIn(item, month)) continue;
      byMonth.get(month)?.push(toResolved(item, housingId));
    }
  };

  for (const item of plan.items) push(item);
  for (const housing of plan.housing) {
    for (const synthetic of housingToItems(housing)) push(synthetic, housing.id);
  }

  return { byMonth, warnings };
}

/** Stable processing order within a month: income -> required -> discretionary -> the rest. */
const KIND_ORDER: Record<ItemKind, number> = {
  income: 0,
  recurring_expense: 1,
  one_time_expense: 2,
  trip_payment: 3,
  transfer: 4,
  goal_contribution: 5,
};

export function orderItems(items: readonly ResolvedItem[]): ResolvedItem[] {
  return [...items].sort((a, b) => {
    const ka = KIND_ORDER[a.kind];
    const kb = KIND_ORDER[b.kind];
    if (ka !== kb) return ka - kb;
    // required before discretionary inside the same kind
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.itemId.localeCompare(b.itemId);
  });
}

export const EXPENSE_KINDS: ItemKind[] = ['recurring_expense', 'one_time_expense', 'trip_payment'];

export function isExpense(kind: ItemKind): boolean {
  return EXPENSE_KINDS.includes(kind);
}
