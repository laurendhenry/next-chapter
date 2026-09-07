import type { Cents } from './money';

export type AccountType = 'checking' | 'savings' | 'high_yield' | 'invested' | 'credit_card';

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  /** For `credit_card` this is the amount OWED, stored positive. */
  balance: Cents;
  /** `high_yield` only — how long money takes to land in checking. */
  transferDelayDays?: 1 | 2 | 3;
  /** `invested` only — how much the user has approved for use. Default 0 = untouchable. */
  scenarioAvailableAmount?: Cents;
  notes?: string;
};

export type GoalPriority = 'essential' | 'important' | 'optional';
export type GoalFlexibility = 'fixed' | 'adjustable' | 'deferrable' | 'cancellable';

export type Goal = {
  id: string;
  name: string;
  priority: GoalPriority;
  flexibility: GoalFlexibility;
  targetAmount: Cents;
  /** Month precision, "YYYY-MM". */
  targetMonth: string;
  /** Already set aside today. */
  reservedAmount: Cents;
  preferredAccountId?: string;
  /** If omitted, the engine reports the required contribution instead. */
  monthlyContribution?: Cents;
  /** false = deferred or cancelled; excluded from all math. */
  active: boolean;
  notes?: string;
};

export type ItemKind =
  | 'income'
  | 'recurring_expense'
  | 'one_time_expense'
  | 'trip_payment'
  | 'goal_contribution'
  | 'transfer';

export type IncomeConfidence = 'confirmed' | 'likely' | 'uncertain';

export type PlanItem = {
  id: string;
  kind: ItemKind;
  label: string;
  /** Always positive. `kind` determines the sign in the forecast. */
  amount: Cents;
  required: boolean;
  startMonth: string;
  /** Omitted = runs to the end of the horizon. */
  endMonth?: string;
  /** Default 1. Ignored for `one_time_expense`. */
  everyNMonths?: number;
  /** ISO date. STORED ONLY — not used in monthly math (plan §6C). */
  dueDate?: string;
  accountId?: string;
  /** Transfers only. A transfer to a credit_card account is a card payment. */
  toAccountId?: string;
  /** goal_contribution / trip_payment. */
  goalId?: string;
  /** Income only. */
  confidence?: IncomeConfidence;
};

export type MoveInCosts = {
  securityDeposit: Cents;
  firstMonthRent: Cents;
  applicationFees: Cents;
  utilitySetup: Cents;
  movingTransport: Cents;
  furnitureHousehold: Cents;
  contingency: Cents;
};

export type HousingAssumption = {
  id: string;
  label: string;
  monthlyRent: Cents;
  utilitiesIncluded: boolean;
  /** Used only when `utilitiesIncluded` is false. */
  monthlyUtilitiesEstimate?: Cents;
  startMonth: string;
  endMonth?: string;
  /** Lands as a single one-time outflow in `startMonth`. */
  moveInCosts?: MoveInCosts;
  accountId?: string;
};

export type Plan = {
  accounts: Account[];
  goals: Goal[];
  items: PlanItem[];
  housing: HousingAssumption[];
};

export type EmergencyTargetMode = 'fixed' | 'months_of_essentials';

export type Settings = {
  horizonMonths: number;
  startMonth: string;
  checkingFloor: Cents;
  emergencyTarget: Cents;
  emergencyTargetMode: EmergencyTargetMode;
  emergencyTargetMonths?: number;
  /** Default false — goals may not reserve money held in `invested` accounts. */
  goalsMayReserveInvested: boolean;
  currency: 'USD';
};
