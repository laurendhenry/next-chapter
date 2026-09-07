import { describe, expect, it } from 'vitest';
import { cents } from '../../types/money';
import { MemoryStorageAdapter } from '../../storage/LocalStorageAdapter';
import { createPlanStore } from '../usePlanStore';

function setup() {
  const adapter = new MemoryStorageAdapter();
  const store = createPlanStore(adapter);
  return { adapter, store };
}

describe('plan store', () => {
  it('starts from seed data and writes it to storage', () => {
    const { adapter, store } = setup();
    expect(store.getState().usedSeedData).toBe(true);
    expect(adapter.load()).not.toBeNull();
    expect(store.getState().baseline.months).toHaveLength(18);
  });

  it('recomputes the forecast when a balance changes', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking');
    expect(checking).toBeDefined();
    store.getState().updateAccount(checking!.id, { balance: cents(500000) });
    const first = store.getState().baseline.months[0];
    expect(first?.openingPlanningFunds).toBe(500000);
  });

  it('persists changes and reloads them into a fresh store', () => {
    const adapter = new MemoryStorageAdapter();
    const store = createPlanStore(adapter);
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(123400) });

    const reopened = createPlanStore(adapter);
    expect(reopened.getState().usedSeedData).toBe(false);
    expect(
      reopened.getState().plan.accounts.find((a) => a.id === checking.id)?.balance,
    ).toBe(123400);
  });

  it('adds, edits and removes items through the single mutation path', () => {
    const { store } = setup();
    const before = store.getState().plan.items.length;
    const id = store.getState().addItem('recurring_expense');
    expect(store.getState().plan.items).toHaveLength(before + 1);

    store.getState().updateItem(id, { label: 'Rent', amount: cents(120000), required: true });
    const item = store.getState().plan.items.find((i) => i.id === id);
    expect(item?.amount).toBe(120000);
    expect(store.getState().baseline.months[0]?.requiredOutflows).toBe(120000);

    store.getState().removeItem(id);
    expect(store.getState().plan.items).toHaveLength(before);
    expect(store.getState().baseline.months[0]?.requiredOutflows).toBe(0);
  });

  it('editing the plan changes later month balances', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(1000000) });
    const income = store.getState().addItem('income');
    store.getState().updateItem(income, { label: 'Job', amount: cents(200000) });

    const months = store.getState().baseline.months;
    expect(months[0]?.income).toBe(200000);
    expect(months[17]?.endingPlanningFunds).toBeGreaterThan(1000000);
  });

  it('surfaces shortfalls once required spending outruns cash', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(100000) });
    const rent = store.getState().addItem('recurring_expense');
    store.getState().updateItem(rent, { label: 'Rent', amount: cents(150000), required: true });
    expect(store.getState().baseline.shortfalls.length).toBeGreaterThan(0);
  });

  it('exports JSON that can be imported back', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(777700) });
    const json = store.getState().exportJson();

    store.getState().resetToSeed();
    expect(store.getState().plan.accounts.find((a) => a.id === checking.id)?.balance).toBe(0);

    expect(store.getState().importJson(json)).toBe(true);
    expect(store.getState().plan.accounts.find((a) => a.id === checking.id)?.balance).toBe(777700);
  });

  it('rejects an unusable import without changing state', () => {
    const { store } = setup();
    const before = store.getState().plan;
    expect(store.getState().importJson('not json at all')).toBe(false);
    expect(store.getState().plan).toBe(before);
  });

  it('updates move-in costs on a housing assumption', () => {
    const { store } = setup();
    const housing = store.getState().plan.housing[0];
    expect(housing).toBeDefined();
    store.getState().updateMoveInCosts(housing!.id, { securityDeposit: cents(150000) });
    expect(
      store.getState().plan.housing.find((h) => h.id === housing!.id)?.moveInCosts
        ?.securityDeposit,
    ).toBe(150000);
  });
});

describe('timeline and shortfall data the UI reads', () => {
  it('lists every horizon month in order', () => {
    const { store } = setup();
    const months = store.getState().baseline.months.map((m) => m.month);
    expect(months).toHaveLength(store.getState().settings.horizonMonths);
    expect([...months].sort()).toEqual(months);
  });

  it('keeps shortfalls chronological across months', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(200000) });
    const rent = store.getState().addItem('recurring_expense');
    store.getState().updateItem(rent, { label: 'Rent', amount: cents(90000), required: true });

    const months = store.getState().baseline.shortfalls.map((s) => s.month);
    expect(months.length).toBeGreaterThan(1);
    expect([...months].sort()).toEqual(months);
  });

  it('a plan edit changes later month balances without touching the engine', () => {
    const { store } = setup();
    const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
    store.getState().updateAccount(checking.id, { balance: cents(400000) });
    const before = store.getState().baseline.months[17]?.endingPlanningFunds;

    const expense = store.getState().addItem('recurring_expense');
    store.getState().updateItem(expense, { label: 'Gym', amount: cents(5000), required: false });
    const after = store.getState().baseline.months[17]?.endingPlanningFunds;

    expect(after).toBeLessThan(before!);
  });
});
