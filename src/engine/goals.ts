import { ZERO, clampAtZero, divCentsCeil, minCents, subCents, type Cents } from '../types/money';
import type { Goal } from '../types/plan';
import { monthDiff } from './months';

export function activeGoals(goals: readonly Goal[]): Goal[] {
  return goals.filter((g) => g.active);
}

/** How much is still needed. Never negative, even if the goal is over-funded. */
export function goalFundingGap(target: Cents, reserved: Cents): Cents {
  return clampAtZero(subCents(target, reserved));
}

/**
 * Months between `currentMonth` and the goal's target month.
 * Zero or negative means the deadline is here or already past.
 */
export function monthsRemaining(currentMonth: string, targetMonth: string): number {
  const diff = monthDiff(currentMonth, targetMonth);
  return diff ?? 0;
}

/**
 * Required monthly contribution to close the gap by the deadline.
 *
 * GUARD (plan §10): when the target month is the current month or already in the past there
 * is nothing to divide by, so the WHOLE remaining gap is reported as this month's
 * requirement. This is the divide-by-zero case the brief specifically called out.
 * Otherwise the division rounds UP, so the app never under-states what the user owes.
 */
export function requiredMonthlyContribution(
  target: Cents,
  reserved: Cents,
  currentMonth: string,
  targetMonth: string,
): Cents {
  const gap = goalFundingGap(target, reserved);
  if (gap === 0) return ZERO;
  const remaining = monthsRemaining(currentMonth, targetMonth);
  if (remaining <= 0) return gap;
  return divCentsCeil(gap, remaining);
}

/**
 * A goal contribution is capped so a goal can never be funded past its own target —
 * money the user does not need to set aside stays available.
 */
export function cappedContribution(requested: Cents, target: Cents, reserved: Cents): Cents {
  const room = goalFundingGap(target, reserved);
  return clampAtZero(minCents(requested, room));
}

export function isUnderfundedAt(goal: Goal, reserved: Cents, month: string): boolean {
  return goal.active && goal.targetMonth === month && reserved < goal.targetAmount;
}

/** Goals sorted for display: essential first, then by deadline, then by name. */
const PRIORITY_RANK: Record<Goal['priority'], number> = {
  essential: 0,
  important: 1,
  optional: 2,
};

export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority];
    const pb = PRIORITY_RANK[b.priority];
    if (pa !== pb) return pa - pb;
    if (a.targetMonth !== b.targetMonth) return a.targetMonth < b.targetMonth ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
