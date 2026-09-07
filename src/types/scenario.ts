import type { Cents } from './money';
import type { Goal, HousingAssumption, PlanItem, Settings } from './plan';

/**
 * Scenarios are stored as override PATCHES on the baseline plan, never as deep copies.
 * That is what makes "all scenarios begin from the same confirmed balances" true by
 * construction — editing a real balance updates every scenario at once.
 *
 * A `null` patch value means "remove this entity in this scenario".
 */
export type ScenarioOverrides = {
  settings?: Partial<Settings>;
  /** accountId -> how much of that invested account is unlocked in this scenario. */
  accountAvailability?: Record<string, Cents>;
  /** accountId -> transfer delay in days. */
  transferDelayDays?: Record<string, 1 | 2 | 3>;
  itemPatches?: Record<string, Partial<PlanItem> | null>;
  addedItems?: PlanItem[];
  goalPatches?: Record<string, Partial<Goal> | null>;
  addedGoals?: Goal[];
  housingPatches?: Record<string, Partial<HousingAssumption> | null>;
  addedHousing?: HousingAssumption[];
};

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  /** Exactly one scenario in the document has this set to true. */
  isBaseline: boolean;
  createdAt: string;
  overrides: ScenarioOverrides;
};

export const EMPTY_OVERRIDES: ScenarioOverrides = {};
