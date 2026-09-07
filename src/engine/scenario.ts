import type { Account, Goal, HousingAssumption, Plan, PlanItem, Settings } from '../types/plan';
import type { ScenarioOverrides } from '../types/scenario';
import { clampAtZero, type Cents } from '../types/money';

/**
 * Applies a scenario's override patches to the baseline plan and returns a NEW plan.
 *
 * This function is pure and never mutates its inputs — that is what makes
 * "all scenarios begin from the same confirmed balances" true by construction, and it is
 * asserted directly in `scenario.test.ts`.
 */
export type ResolvedPlan = { plan: Plan; settings: Settings };

function patchEntities<T extends { id: string }>(
  base: readonly T[],
  patches: Record<string, Partial<T> | null> | undefined,
  added: readonly T[] | undefined,
): T[] {
  const out: T[] = [];
  for (const entity of base) {
    const patch = patches ? patches[entity.id] : undefined;
    // `null` means "this scenario removes the entity".
    if (patch === null) continue;
    out.push(patch ? { ...entity, ...patch, id: entity.id } : entity);
  }
  if (added) {
    for (const entity of added) {
      // An addition with a colliding id replaces rather than duplicating.
      const existing = out.findIndex((e) => e.id === entity.id);
      if (existing >= 0) out[existing] = entity;
      else out.push(entity);
    }
  }
  return out;
}

function patchAccounts(
  accounts: readonly Account[],
  overrides: ScenarioOverrides,
): Account[] {
  const availability = overrides.accountAvailability;
  const delays = overrides.transferDelayDays;
  if (!availability && !delays) return [...accounts];
  return accounts.map((account) => {
    const nextAvailable = availability ? availability[account.id] : undefined;
    const nextDelay = delays ? delays[account.id] : undefined;
    if (nextAvailable === undefined && nextDelay === undefined) return account;
    const next: Account = { ...account };
    // Availability only means anything on an invested account.
    if (nextAvailable !== undefined && account.type === 'invested') {
      next.scenarioAvailableAmount = clampAtZero(nextAvailable as Cents);
    }
    if (nextDelay !== undefined && account.type === 'high_yield') {
      next.transferDelayDays = nextDelay;
    }
    return next;
  });
}

export function resolvePlan(
  plan: Plan,
  settings: Settings,
  overrides: ScenarioOverrides | undefined,
): ResolvedPlan {
  const o = overrides ?? {};
  return {
    plan: {
      accounts: patchAccounts(plan.accounts, o),
      items: patchEntities<PlanItem>(plan.items, o.itemPatches, o.addedItems),
      goals: patchEntities<Goal>(plan.goals, o.goalPatches, o.addedGoals),
      housing: patchEntities<HousingAssumption>(
        plan.housing,
        o.housingPatches,
        o.addedHousing,
      ),
    },
    settings: { ...settings, ...(o.settings ?? {}) },
  };
}

/** True when the overrides change nothing at all (the baseline scenario). */
export function isEmptyOverrides(overrides: ScenarioOverrides | undefined): boolean {
  if (!overrides) return true;
  return Object.values(overrides).every(
    (v) => v === undefined || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0),
  );
}
