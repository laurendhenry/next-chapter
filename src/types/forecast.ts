import type { Cents } from './money';
import type { ItemKind } from './plan';

export type ShortfallSeverity = 'critical' | 'warning' | 'info';
export type ShortfallCategory = 'cash' | 'timing' | 'goal_funding' | 'volatility' | 'credit';

export type Shortfall = {
  /** Deterministic: `${month}:${ruleId}:${subject}`. The engine never generates randomness. */
  id: string;
  month: string;
  severity: ShortfallSeverity;
  category: ShortfallCategory;
  amount: Cents;
  title: string;
  /** Plain-English sentence naming the assumption that produced this. */
  cause: string;
  affectedGoalIds: string[];
  affectedAccountIds: string[];
  /** Display only. The engine NEVER auto-applies a lever. */
  suggestedLevers: string[];
};

export type GoalProgress = {
  goalId: string;
  name: string;
  reserved: Cents;
  target: Cents;
  gap: Cents;
  requiredMonthlyContribution: Cents;
  monthsRemaining: number;
};

export type ForecastLineItem = {
  itemId: string;
  label: string;
  amount: Cents;
  kind: ItemKind;
  required: boolean;
  accountId?: string;
};

/** Recorded whenever the engine sells approved invested funds to cover a shortfall. */
export type InvestedDraw = {
  accountId: string;
  amount: Cents;
  reason: string;
};

export type MonthResult = {
  month: string;
  openingPlanningFunds: Cents;
  openingBillPayFunds: Cents;
  income: Cents;
  requiredOutflows: Cents;
  discretionaryOutflows: Cents;
  goalContributions: Cents;
  netTransfers: Cents;
  creditCardPayments: Cents;
  endingPlanningFunds: Cents;
  endingByAccount: Record<string, Cents>;
  endingFullyLiquid: Cents;
  endingNearLiquid: Cents;
  endingInvested: Cents;
  endingBillPayFunds: Cents;
  endingCreditCardDebt: Cents;
  protectedFunds: Cents;
  flexibleFunds: Cents;
  goalProgress: GoalProgress[];
  investedDraws: InvestedDraw[];
  shortfalls: Shortfall[];
  lineItems: ForecastLineItem[];
};

export type LowestPoint = { month: string; amount: Cents };

export type MoveReadiness = {
  housingId: string;
  label: string;
  targetMonth: string;
  cost: Cents;
  available: Cents;
  ready: boolean;
  gap: Cents;
};

export type TripAffordability = {
  goalId: string;
  name: string;
  targetMonth: string;
  affordable: boolean;
  gap: Cents;
};

export type ForecastMetrics = {
  totalAssets: Cents;
  fullyLiquid: Cents;
  nearLiquid: Cents;
  invested: Cents;
  creditCardDebt: Cents;
  netWorth: Cents;
  planningFunds: Cents;
  immediateBillPayFunds: Cents;
  protectedFunds: Cents;
  flexibleFunds: Cents;
  lowestCheckingBalance: LowestPoint;
  lowestBillPayBalance: LowestPoint;
  lowestPlanningFunds: LowestPoint;
  /** Cash + near-cash only. `Infinity` when there are no essential outflows. */
  runwayMonthsConservative: number;
  /** Includes user-approved invested funds. */
  runwayMonthsExpanded: number;
  essentialMonthlyOutflow: Cents;
  atlantaMoveTarget: Cents;
  emergencyTarget: Cents;
  potentiallyExposedAmount: Cents;
  moveReady: MoveReadiness | null;
  tripAffordability: TripAffordability[];
};

export type ForecastResult = {
  months: MonthResult[];
  metrics: ForecastMetrics;
  /** Flattened, chronological. */
  shortfalls: Shortfall[];
  /** Non-fatal problems with the INPUT (bad month keys, dangling ids). Engine never throws. */
  warnings: string[];
};
