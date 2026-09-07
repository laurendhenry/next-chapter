import { describe, expect, it } from 'vitest';
import { cents } from '../../types/money';
import { resolvePlan, runForecast } from '../../engine';
import { MemoryStorageAdapter } from '../../storage/LocalStorageAdapter';
import { assumptionsToOverrides, emptyAssumptions } from '../assumptions';
import { createPlanStore } from '../usePlanStore';

describe('assumptionsToOverrides', () => {
  it('produces no overrides when nothing is switched on', () => {
    expect(assumptionsToOverrides('s1', emptyAssumptions('2026-09'))).toEqual({});
  });

  it('ignores enabled assumptions with a zero amount', () => {
    const a = emptyAssumptions('2026-09');
    a.oneTimeCost.enabled = true;
    a.monthlyExpenseChange.enabled = true;
    expect(assumptionsToOverrides('s1', a)).toEqual({});
  });

  it('maps a one-time cost onto a single-month expense item', () => {
    const a = emptyAssumptions('2026-09');
    a.oneTimeCost = { enabled: true, label: 'Move-in', amount: cents(300000), month: '2027-08' };
    const added = assumptionsToOverrides('s1', a).addedItems ?? [];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: 's1:one-time',
      kind: 'one_time_expense',
      amount: 300000,
      startMonth: '2027-08',
      required: true,
    });
  });

  it('maps a positive monthly change onto a recurring expense', () => {
    const a = emptyAssumptions('2026-09');
    a.monthlyExpenseChange = {
      enabled: true,
      label: 'Higher rent',
      amount: cents(45000),
      startMonth: '2027-01',
    };
    const added = assumptionsToOverrides('s1', a).addedItems ?? [];
    expect(added[0]).toMatchObject({ kind: 'recurring_expense', amount: 45000 });
  });

  it('maps a negative monthly change onto extra income, using the absolute amount', () => {
    const a = emptyAssumptions('2026-09');
    a.monthlyExpenseChange = {
      enabled: true,
      label: 'Roommate',
      amount: cents(-60000),
      startMonth: '2027-01',
    };
    const added = assumptionsToOverrides('s1', a).addedItems ?? [];
    expect(added[0]).toMatchObject({ kind: 'income', amount: 60000 });
  });

  it('maps an income override onto an item patch', () => {
    const a = emptyAssumptions('2026-09');
    a.incomeOverride = {
      enabled: true,
      itemId: 'item-income',
      amount: cents(0),
      startMonth: '2027-03',
    };
    expect(assumptionsToOverrides('s1', a).itemPatches).toEqual({
      'item-income': { amount: 0, startMonth: '2027-03' },
    });
  });

  it('never mutates the baseline plan when resolved', () => {
    const store = createPlanStore(new MemoryStorageAdapter());
    const plan = store.getState().plan;
    const settings = store.getState().settings;
    const snapshot = JSON.stringify(plan);

    const a = emptyAssumptions(settings.startMonth);
    a.oneTimeCost = { enabled: true, label: 'x', amount: cents(500000), month: settings.startMonth };
    const resolved = resolvePlan(plan, settings, assumptionsToOverrides('s1', a));

    expect(JSON.stringify(plan)).toBe(snapshot);
    expect(resolved.plan.items.length).toBe(plan.items.length + 1);
    expect(runForecast(resolved.plan, resolved.settings).months).toHaveLength(
      settings.horizonMonths,
    );
  });
});

describe('scenario comparison in the store', () => {
  function seeded() {
    const store = createPlanStore(new MemoryStorageAdapter());
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(1000000) });
    const income = store.getState().addItem('income');
    store.getState().updateItem(income, { label: 'Job', amount: cents(300000) });
    return { store, incomeId: income };
  }

  it('starts with exactly two scenarios that match the baseline', () => {
    const { store } = seeded();
    const { baseline, scenarioForecasts } = store.getState();
    expect(scenarioForecasts).toHaveLength(2);
    for (const f of scenarioForecasts) {
      expect(f.metrics.lowestPlanningFunds.amount).toBe(baseline.metrics.lowestPlanningFunds.amount);
    }
  });

  it('editing one scenario changes only that scenario', () => {
    const { store } = seeded();
    const baselineBefore = store.getState().baseline.metrics.lowestPlanningFunds.amount;
    const otherBefore = store.getState().scenarioForecasts[1]?.metrics.lowestPlanningFunds.amount;

    const a = store.getState().scenarios[0]!.assumptions;
    store.getState().updateScenarioAssumptions(0, {
      monthlyExpenseChange: {
        ...a.monthlyExpenseChange,
        enabled: true,
        label: 'Higher rent',
        amount: cents(400000),
        startMonth: store.getState().settings.startMonth,
      },
    });

    const state = store.getState();
    expect(state.scenarioForecasts[0]?.metrics.lowestPlanningFunds.amount).toBeLessThan(
      baselineBefore,
    );
    expect(state.baseline.metrics.lowestPlanningFunds.amount).toBe(baselineBefore);
    expect(state.scenarioForecasts[1]?.metrics.lowestPlanningFunds.amount).toBe(otherBefore);
  });

  it('an income disruption produces shortfalls the baseline does not have', () => {
    const { store, incomeId } = seeded();
    expect(store.getState().baseline.shortfalls.length).toBe(0);

    const rent = store.getState().addItem('recurring_expense');
    store.getState().updateItem(rent, { label: 'Rent', amount: cents(250000), required: true });

    const a = store.getState().scenarios[1]!.assumptions;
    store.getState().updateScenarioAssumptions(1, {
      incomeOverride: {
        ...a.incomeOverride,
        enabled: true,
        itemId: incomeId,
        amount: cents(0),
        startMonth: store.getState().settings.startMonth,
      },
    });

    const state = store.getState();
    expect(state.scenarioForecasts[1]!.shortfalls.length).toBeGreaterThan(
      state.baseline.shortfalls.length,
    );
  });

  it('scenario assumptions survive a reload from storage', () => {
    const adapter = new MemoryStorageAdapter();
    const store = createPlanStore(adapter);
    store.getState().updateScenario(0, { name: 'Renamed' });
    const a = store.getState().scenarios[0]!.assumptions;
    store.getState().updateScenarioAssumptions(0, {
      oneTimeCost: { ...a.oneTimeCost, enabled: true, amount: cents(123400), label: 'Deposit' },
    });

    const reopened = createPlanStore(adapter);
    const scenario = reopened.getState().scenarios[0];
    expect(scenario?.name).toBe('Renamed');
    expect(scenario?.assumptions.oneTimeCost.amount).toBe(123400);
    expect(scenario?.assumptions.oneTimeCost.enabled).toBe(true);
  });
});
