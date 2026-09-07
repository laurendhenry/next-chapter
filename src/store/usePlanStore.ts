import { create } from 'zustand';
import { ZERO, type Cents } from '../types/money';
import type { Account, HousingAssumption, MoveInCosts, Plan, PlanItem, Settings } from '../types/plan';
import type { ForecastResult } from '../types/forecast';
import type { ScenarioAssumptions } from '../types/assumptions';
import { resolvePlan, runForecast } from '../engine';
import type { StorageAdapter, StoredDocument, StoredScenario } from '../storage/StorageAdapter';
import { LocalStorageAdapter } from '../storage/LocalStorageAdapter';
import {
  SCHEMA_VERSION,
  deserializeDocument,
  serializeDocument,
  type Defaults,
} from '../storage/schema';
import { seedComparisonScenarios, seedPlan, seedSettings } from './seed';
import { assumptionsToOverrides } from './assumptions';

/**
 * The single source of truth for the app.
 *
 * Every mutation funnels through `commit()`, which does three things in one place:
 *   1. writes the new document to storage,
 *   2. recomputes the baseline forecast with the pure Phase 1 engine,
 *   3. recomputes both comparison scenarios from the SAME baseline plan.
 *
 * No screen ever does financial math — the UI only reads `baseline` / `scenarioForecasts`.
 */

export type ScenarioView = {
  id: string;
  name: string;
  assumptions: ScenarioAssumptions;
  forecast: ForecastResult;
};

export type PlanStore = {
  plan: Plan;
  settings: Settings;
  scenarios: StoredScenario[];
  /** Derived: the baseline forecast. Never edited directly. */
  baseline: ForecastResult;
  /** Derived: one forecast per comparison scenario, in the same order as `scenarios`. */
  scenarioForecasts: ForecastResult[];
  /** True when the current state came from a fresh seed rather than saved data. */
  usedSeedData: boolean;

  updateSettings(patch: Partial<Settings>): void;
  updateAccount(id: string, patch: Partial<Account>): void;

  addItem(kind: PlanItem['kind']): string;
  updateItem(id: string, patch: Partial<PlanItem>): void;
  removeItem(id: string): void;

  updateHousing(id: string, patch: Partial<HousingAssumption>): void;
  updateMoveInCosts(id: string, patch: Partial<MoveInCosts>): void;

  updateScenario(index: number, patch: Partial<Omit<StoredScenario, 'id'>>): void;
  updateScenarioAssumptions(index: number, patch: Partial<ScenarioAssumptions>): void;

  exportJson(): string;
  importJson(text: string): boolean;
  resetToSeed(): void;
};

export function defaults(): Defaults {
  return { plan: seedPlan(), settings: seedSettings(), scenarios: seedComparisonScenarios() };
}

function seedDocument(): StoredDocument {
  const d = defaults();
  return { schemaVersion: SCHEMA_VERSION, plan: d.plan, settings: d.settings, scenarios: d.scenarios };
}

function forecastFor(doc: StoredDocument): {
  baseline: ForecastResult;
  scenarioForecasts: ForecastResult[];
} {
  const baseline = runForecast(doc.plan, doc.settings);
  const scenarioForecasts = doc.scenarios.map((scenario) => {
    const overrides = assumptionsToOverrides(scenario.id, scenario.assumptions);
    // resolvePlan is pure — the baseline plan object is never touched.
    const resolved = resolvePlan(doc.plan, doc.settings, overrides);
    return runForecast(resolved.plan, resolved.settings);
  });
  return { baseline, scenarioForecasts };
}

/** Exposed for tests: builds a store bound to any adapter. */
export function createPlanStore(adapter: StorageAdapter) {
  const loaded = adapter.load();
  const initialDoc = loaded ?? seedDocument();
  const usedSeedData = loaded === null;
  if (usedSeedData) adapter.save(initialDoc);

  return create<PlanStore>((set, get) => {
    /** The one and only write path. */
    const commit = (next: Partial<Pick<StoredDocument, 'plan' | 'settings' | 'scenarios'>>) => {
      const state = get();
      const doc: StoredDocument = {
        schemaVersion: SCHEMA_VERSION,
        plan: next.plan ?? state.plan,
        settings: next.settings ?? state.settings,
        scenarios: next.scenarios ?? state.scenarios,
      };
      adapter.save(doc);
      set({ ...doc, ...forecastFor(doc), usedSeedData: false });
    };

    const patchPlan = (patch: Partial<Plan>) => commit({ plan: { ...get().plan, ...patch } });

    return {
      ...initialDoc,
      ...forecastFor(initialDoc),
      usedSeedData,

      updateSettings(patch) {
        commit({ settings: { ...get().settings, ...patch } });
      },

      updateAccount(id, patch) {
        patchPlan({
          accounts: get().plan.accounts.map((a) => (a.id === id ? { ...a, ...patch, id } : a)),
        });
      },

      addItem(kind) {
        const { plan, settings } = get();
        const id = `item-${kind}-${Date.now().toString(36)}-${plan.items.length}`;
        const checking = plan.accounts.find((a) => a.type === 'checking')?.id;
        const item: PlanItem = {
          id,
          kind,
          label: '',
          amount: ZERO,
          required: kind === 'recurring_expense' || kind === 'one_time_expense',
          startMonth: settings.startMonth,
          ...(checking ? { accountId: checking } : {}),
          ...(kind === 'income' ? { confidence: 'likely' as const, required: false } : {}),
        };
        patchPlan({ items: [...plan.items, item] });
        return id;
      },

      updateItem(id, patch) {
        patchPlan({
          items: get().plan.items.map((i) => (i.id === id ? { ...i, ...patch, id } : i)),
        });
      },

      removeItem(id) {
        patchPlan({ items: get().plan.items.filter((i) => i.id !== id) });
      },

      updateHousing(id, patch) {
        patchPlan({
          housing: get().plan.housing.map((h) => (h.id === id ? { ...h, ...patch, id } : h)),
        });
      },

      updateMoveInCosts(id, patch) {
        patchPlan({
          housing: get().plan.housing.map((h) =>
            h.id === id ? { ...h, moveInCosts: { ...emptyMoveInCosts(), ...h.moveInCosts, ...patch } } : h,
          ),
        });
      },

      updateScenario(index, patch) {
        commit({
          scenarios: get().scenarios.map((s, i) => (i === index ? { ...s, ...patch, id: s.id } : s)),
        });
      },

      updateScenarioAssumptions(index, patch) {
        commit({
          scenarios: get().scenarios.map((s, i) =>
            i === index ? { ...s, assumptions: { ...s.assumptions, ...patch } } : s,
          ),
        });
      },

      exportJson() {
        const { plan, settings, scenarios } = get();
        return serializeDocument({ schemaVersion: SCHEMA_VERSION, plan, settings, scenarios });
      },

      importJson(text) {
        const doc = deserializeDocument(text, defaults());
        if (!doc) return false;
        commit({ plan: doc.plan, settings: doc.settings, scenarios: doc.scenarios });
        return true;
      },

      resetToSeed() {
        const doc = seedDocument();
        commit({ plan: doc.plan, settings: doc.settings, scenarios: doc.scenarios });
      },
    };
  });
}

export function emptyMoveInCosts(): MoveInCosts {
  const zero = ZERO as Cents;
  return {
    securityDeposit: zero,
    firstMonthRent: zero,
    applicationFees: zero,
    utilitySetup: zero,
    movingTransport: zero,
    furnitureHousehold: zero,
    contingency: zero,
  };
}

/** The app-wide store, backed by one localStorage document. */
export const usePlanStore = createPlanStore(new LocalStorageAdapter(defaults()));

/** Baseline + the two comparison scenarios, ready for the comparison table. */
export function useScenarioViews(): ScenarioView[] {
  const scenarios = usePlanStore((s) => s.scenarios);
  const forecasts = usePlanStore((s) => s.scenarioForecasts);
  const views: ScenarioView[] = [];
  scenarios.forEach((s, i) => {
    const forecast = forecasts[i];
    if (forecast) views.push({ id: s.id, name: s.name, assumptions: s.assumptions, forecast });
  });
  return views;
}
