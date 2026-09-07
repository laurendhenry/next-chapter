import type { Cents } from './money';

/**
 * Phase 4A keeps the scenario editor deliberately tiny: three high-impact assumptions that
 * map onto override patches the Phase 1 engine already understands. This is the persisted
 * shape; `assumptionsToOverrides()` turns it into a `ScenarioOverrides` patch.
 */
export type ScenarioAssumptions = {
  /** A single extra outflow in one month (e.g. move-in costs, a car repair). */
  oneTimeCost: {
    enabled: boolean;
    label: string;
    amount: Cents;
    month: string;
  };
  /** A change to monthly required spending from `startMonth` onward. Positive = costs more. */
  monthlyExpenseChange: {
    enabled: boolean;
    label: string;
    amount: Cents;
    startMonth: string;
  };
  /** Replace one existing income item's monthly amount (0 = the income stops). */
  incomeOverride: {
    enabled: boolean;
    itemId: string;
    amount: Cents;
    startMonth: string;
  };
};
