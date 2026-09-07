import { cents, type Cents } from '../types/money';
import type {
  Account,
  AccountType,
  EmergencyTargetMode,
  Goal,
  GoalFlexibility,
  GoalPriority,
  HousingAssumption,
  IncomeConfidence,
  ItemKind,
  MoveInCosts,
  Plan,
  PlanItem,
  Settings,
} from '../types/plan';
import type { ScenarioAssumptions } from '../types/assumptions';
import { isValidMonthKey } from '../engine/months';
import type { StoredDocument, StoredScenario } from './StorageAdapter';

/**
 * Hand-rolled, total validation for the persisted document.
 *
 * Nothing in here throws. Anything unrecognisable is dropped or replaced with a safe default,
 * and a document that is missing its core shape returns `null` so the caller can fall back to
 * seed data. That is what keeps rule "corrupt local data must not crash the app" true.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'next-chapter:v1';

const ACCOUNT_TYPES: AccountType[] = [
  'checking',
  'savings',
  'high_yield',
  'invested',
  'credit_card',
];
const ITEM_KINDS: ItemKind[] = [
  'income',
  'recurring_expense',
  'one_time_expense',
  'trip_payment',
  'goal_contribution',
  'transfer',
];
const PRIORITIES: GoalPriority[] = ['essential', 'important', 'optional'];
const FLEXIBILITIES: GoalFlexibility[] = ['fixed', 'adjustable', 'deferrable', 'cancellable'];
const CONFIDENCES: IncomeConfidence[] = ['confirmed', 'likely', 'uncertain'];
const TARGET_MODES: EmergencyTargetMode[] = ['fixed', 'months_of_essentials'];

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nonEmptyStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function money(value: unknown, fallback: Cents = cents(0)): Cents {
  return typeof value === 'number' && Number.isFinite(value) ? cents(value) : fallback;
}

function optionalMoney(value: unknown): Cents | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? cents(value) : undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function month(value: unknown, fallback: string): string {
  return typeof value === 'string' && isValidMonthKey(value) ? value : fallback;
}

function optionalMonth(value: unknown): string | undefined {
  return typeof value === 'string' && isValidMonthKey(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function delayDays(value: unknown): 1 | 2 | 3 | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function withOptional<T extends object>(base: T, extras: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function parseAccount(raw: unknown): Account | null {
  if (!isRecord(raw)) return null;
  const id = nonEmptyStr(raw.id);
  if (!id) return null;
  return withOptional<Account>(
    {
      id,
      name: str(raw.name, 'Account'),
      type: oneOf(raw.type, ACCOUNT_TYPES, 'checking'),
      balance: money(raw.balance),
    },
    {
      transferDelayDays: delayDays(raw.transferDelayDays),
      scenarioAvailableAmount: optionalMoney(raw.scenarioAvailableAmount),
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    },
  );
}

function parseGoal(raw: unknown, fallbackMonth: string): Goal | null {
  if (!isRecord(raw)) return null;
  const id = nonEmptyStr(raw.id);
  if (!id) return null;
  return withOptional<Goal>(
    {
      id,
      name: str(raw.name, 'Goal'),
      priority: oneOf(raw.priority, PRIORITIES, 'optional'),
      flexibility: oneOf(raw.flexibility, FLEXIBILITIES, 'adjustable'),
      targetAmount: money(raw.targetAmount),
      targetMonth: month(raw.targetMonth, fallbackMonth),
      reservedAmount: money(raw.reservedAmount),
      active: bool(raw.active, true),
    },
    {
      preferredAccountId: nonEmptyStr(raw.preferredAccountId) ?? undefined,
      monthlyContribution: optionalMoney(raw.monthlyContribution),
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    },
  );
}

function parseItem(raw: unknown, fallbackMonth: string): PlanItem | null {
  if (!isRecord(raw)) return null;
  const id = nonEmptyStr(raw.id);
  if (!id) return null;
  const everyN =
    typeof raw.everyNMonths === 'number' && Number.isFinite(raw.everyNMonths)
      ? Math.max(1, Math.trunc(raw.everyNMonths))
      : undefined;
  return withOptional<PlanItem>(
    {
      id,
      kind: oneOf(raw.kind, ITEM_KINDS, 'recurring_expense'),
      label: str(raw.label, 'Item'),
      amount: money(raw.amount),
      required: bool(raw.required, false),
      startMonth: month(raw.startMonth, fallbackMonth),
    },
    {
      endMonth: optionalMonth(raw.endMonth),
      everyNMonths: everyN,
      dueDate: typeof raw.dueDate === 'string' ? raw.dueDate : undefined,
      accountId: nonEmptyStr(raw.accountId) ?? undefined,
      toAccountId: nonEmptyStr(raw.toAccountId) ?? undefined,
      goalId: nonEmptyStr(raw.goalId) ?? undefined,
      confidence: optionalOneOf(raw.confidence, CONFIDENCES),
    },
  );
}

function parseMoveInCosts(raw: unknown): MoveInCosts | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    securityDeposit: money(raw.securityDeposit),
    firstMonthRent: money(raw.firstMonthRent),
    applicationFees: money(raw.applicationFees),
    utilitySetup: money(raw.utilitySetup),
    movingTransport: money(raw.movingTransport),
    furnitureHousehold: money(raw.furnitureHousehold),
    contingency: money(raw.contingency),
  };
}

function parseHousing(raw: unknown, fallbackMonth: string): HousingAssumption | null {
  if (!isRecord(raw)) return null;
  const id = nonEmptyStr(raw.id);
  if (!id) return null;
  return withOptional<HousingAssumption>(
    {
      id,
      label: str(raw.label, 'Housing'),
      monthlyRent: money(raw.monthlyRent),
      utilitiesIncluded: bool(raw.utilitiesIncluded, true),
      startMonth: month(raw.startMonth, fallbackMonth),
    },
    {
      monthlyUtilitiesEstimate: optionalMoney(raw.monthlyUtilitiesEstimate),
      endMonth: optionalMonth(raw.endMonth),
      moveInCosts: parseMoveInCosts(raw.moveInCosts),
      accountId: nonEmptyStr(raw.accountId) ?? undefined,
    },
  );
}

export function parseSettings(raw: unknown, fallback: Settings): Settings {
  if (!isRecord(raw)) return fallback;
  const horizon =
    typeof raw.horizonMonths === 'number' && Number.isFinite(raw.horizonMonths)
      ? Math.min(120, Math.max(1, Math.trunc(raw.horizonMonths)))
      : fallback.horizonMonths;
  const targetMonths =
    typeof raw.emergencyTargetMonths === 'number' && Number.isFinite(raw.emergencyTargetMonths)
      ? Math.max(0, Math.trunc(raw.emergencyTargetMonths))
      : fallback.emergencyTargetMonths;
  return withOptional<Settings>(
    {
      horizonMonths: horizon,
      startMonth: month(raw.startMonth, fallback.startMonth),
      checkingFloor: money(raw.checkingFloor, fallback.checkingFloor),
      emergencyTarget: money(raw.emergencyTarget, fallback.emergencyTarget),
      emergencyTargetMode: oneOf(
        raw.emergencyTargetMode,
        TARGET_MODES,
        fallback.emergencyTargetMode,
      ),
      goalsMayReserveInvested: bool(
        raw.goalsMayReserveInvested,
        fallback.goalsMayReserveInvested,
      ),
      currency: 'USD',
    },
    { emergencyTargetMonths: targetMonths },
  );
}

export function parsePlan(raw: unknown, fallbackMonth: string): Plan | null {
  if (!isRecord(raw)) return null;
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts.map(parseAccount).filter((a): a is Account => a !== null)
    : null;
  // A plan with no readable accounts cannot produce a forecast worth showing.
  if (!accounts || accounts.length === 0) return null;
  return {
    accounts,
    goals: Array.isArray(raw.goals)
      ? raw.goals.map((g) => parseGoal(g, fallbackMonth)).filter((g): g is Goal => g !== null)
      : [],
    items: Array.isArray(raw.items)
      ? raw.items.map((i) => parseItem(i, fallbackMonth)).filter((i): i is PlanItem => i !== null)
      : [],
    housing: Array.isArray(raw.housing)
      ? raw.housing
          .map((h) => parseHousing(h, fallbackMonth))
          .filter((h): h is HousingAssumption => h !== null)
      : [],
  };
}

function parseAssumptions(raw: unknown, fallback: ScenarioAssumptions): ScenarioAssumptions {
  if (!isRecord(raw)) return fallback;
  const one = isRecord(raw.oneTimeCost) ? raw.oneTimeCost : {};
  const monthly = isRecord(raw.monthlyExpenseChange) ? raw.monthlyExpenseChange : {};
  const income = isRecord(raw.incomeOverride) ? raw.incomeOverride : {};
  return {
    oneTimeCost: {
      enabled: bool(one.enabled, fallback.oneTimeCost.enabled),
      label: str(one.label, fallback.oneTimeCost.label),
      amount: money(one.amount, fallback.oneTimeCost.amount),
      month: month(one.month, fallback.oneTimeCost.month),
    },
    monthlyExpenseChange: {
      enabled: bool(monthly.enabled, fallback.monthlyExpenseChange.enabled),
      label: str(monthly.label, fallback.monthlyExpenseChange.label),
      amount: money(monthly.amount, fallback.monthlyExpenseChange.amount),
      startMonth: month(monthly.startMonth, fallback.monthlyExpenseChange.startMonth),
    },
    incomeOverride: {
      enabled: bool(income.enabled, fallback.incomeOverride.enabled),
      itemId: str(income.itemId, fallback.incomeOverride.itemId),
      amount: money(income.amount, fallback.incomeOverride.amount),
      startMonth: month(income.startMonth, fallback.incomeOverride.startMonth),
    },
  };
}

/**
 * Future schema versions get a case here. Version 1 needs no migration, but the branch exists
 * so stored data can evolve without a destructive reset.
 */
function migrate(raw: Raw): Raw {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return raw; // newer than us: parse defensively, keep what fits
  return raw;
}

export type Defaults = { plan: Plan; settings: Settings; scenarios: StoredScenario[] };

/** Parses an unknown value into a usable document, or returns `null` to use seed data. */
export function parseDocument(raw: unknown, defaults: Defaults): StoredDocument | null {
  if (!isRecord(raw)) return null;
  const migrated = migrate(raw);
  const settings = parseSettings(migrated.settings, defaults.settings);
  const plan = parsePlan(migrated.plan, settings.startMonth);
  if (!plan) return null;

  const rawScenarios = Array.isArray(migrated.scenarios) ? migrated.scenarios : [];
  const scenarios = defaults.scenarios.map((fallback, index) => {
    const candidate = rawScenarios[index];
    if (!isRecord(candidate)) return fallback;
    return {
      id: nonEmptyStr(candidate.id) ?? fallback.id,
      name: str(candidate.name, fallback.name),
      assumptions: parseAssumptions(candidate.assumptions, fallback.assumptions),
    };
  });

  return { schemaVersion: SCHEMA_VERSION, plan, settings, scenarios };
}

/** Pretty-printed JSON for the export button. */
export function serializeDocument(doc: StoredDocument): string {
  return JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION }, null, 2);
}

/** Parses exported JSON back into a document. Returns `null` when the text is unusable. */
export function deserializeDocument(text: string, defaults: Defaults): StoredDocument | null {
  try {
    return parseDocument(JSON.parse(text), defaults);
  } catch {
    return null;
  }
}
