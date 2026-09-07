import { describe, expect, it } from 'vitest';
import { cents } from '../../types/money';
import { MemoryStorageAdapter } from '../../storage/LocalStorageAdapter';
import { contributionItemId, createPlanStore } from '../usePlanStore';

function setup() {
  const adapter = new MemoryStorageAdapter();
  const store = createPlanStore(adapter);
  // Enough cash that goal funding is never limited by an empty checking account.
  const checking = store.getState().plan.accounts.find((a) => a.type === 'checking')!;
  store.getState().updateAccount(checking.id, { balance: cents(2000000) });
  return { adapter, store };
}

function addEssentialGoal(store: ReturnType<typeof createPlanStore>) {
  const id = store.getState().addGoal();
  store.getState().updateGoal(id, {
    name: 'Emergency reserve',
    priority: 'essential',
    targetAmount: cents(300000),
  });
  return id;
}

describe('goal management', () => {
  it('adds a goal with usable defaults inside the horizon', () => {
    const { store } = setup();
    const before = store.getState().plan.goals.length;
    const id = store.getState().addGoal();
    const goal = store.getState().plan.goals.find((g) => g.id === id)!;

    expect(store.getState().plan.goals).toHaveLength(before + 1);
    expect(goal.active).toBe(true);
    expect(goal.targetAmount).toBe(0);
    expect(goal.reservedAmount).toBe(0);
    // The default deadline must be a month the forecast actually covers.
    expect(store.getState().baseline.months.some((m) => m.month === goal.targetMonth)).toBe(true);
  });

  it('reports gap and required monthly contribution from the engine', () => {
    const { store } = setup();
    const id = addEssentialGoal(store);
    store.getState().updateGoal(id, { reservedAmount: cents(100000) });

    const progress = store.getState().baseline.months[0]!.goalProgress.find(
      (p) => p.goalId === id,
    )!;
    expect(progress.gap).toBe(200000);
    expect(progress.requiredMonthlyContribution).toBeGreaterThan(0);
    // Rounded up, so the app never under-states what is owed.
    expect(progress.requiredMonthlyContribution * progress.monthsRemaining).toBeGreaterThanOrEqual(
      200000,
    );
  });

  it('counts an essential reservation in protectedFunds and removes it from left-over money', () => {
    const { store } = setup();
    const before = store.getState().baseline.metrics;

    const id = addEssentialGoal(store);
    store.getState().updateGoal(id, { reservedAmount: cents(250000) });
    const after = store.getState().baseline.metrics;

    expect(after.protectedFunds - before.protectedFunds).toBe(250000);
    expect(before.flexibleFunds - after.flexibleFunds).toBe(250000);
    // Reserving money does not create or destroy money.
    expect(after.planningFunds).toBe(before.planningFunds);
  });

  it('does not protect non-essential reservations', () => {
    const { store } = setup();
    const before = store.getState().baseline.metrics.protectedFunds;
    const id = store.getState().addGoal();
    store.getState().updateGoal(id, {
      name: 'Cruise',
      priority: 'optional',
      targetAmount: cents(200000),
      reservedAmount: cents(150000),
    });
    expect(store.getState().baseline.metrics.protectedFunds).toBe(before);
  });

  it('never protects more than the goal target, even if over-reserved', () => {
    const { store } = setup();
    const before = store.getState().baseline.metrics.protectedFunds;
    const id = addEssentialGoal(store);
    store.getState().updateGoal(id, { reservedAmount: cents(500000) });
    expect(store.getState().baseline.metrics.protectedFunds - before).toBe(300000);
  });

  it('turns a monthly contribution into a real plan item that fills the bucket over time', () => {
    const { store } = setup();
    const id = addEssentialGoal(store);
    store.getState().setGoalContribution(id, cents(100000));

    const item = store.getState().plan.items.find((i) => i.id === contributionItemId(id));
    expect(item?.kind).toBe('goal_contribution');
    expect(item?.goalId).toBe(id);
    expect(store.getState().plan.goals.find((g) => g.id === id)?.monthlyContribution).toBe(100000);

    const months = store.getState().baseline.months;
    const reservedIn = (index: number) =>
      months[index]!.goalProgress.find((p) => p.goalId === id)!.reserved;
    expect(reservedIn(0)).toBe(100000);
    expect(reservedIn(1)).toBe(200000);
    // Capped at the target: the fourth month cannot push past $3,000.
    expect(reservedIn(2)).toBe(300000);
    expect(reservedIn(3)).toBe(300000);
  });

  it('clearing a contribution deletes its plan item', () => {
    const { store } = setup();
    const id = addEssentialGoal(store);
    store.getState().setGoalContribution(id, cents(50000));
    store.getState().setGoalContribution(id, cents(0));

    expect(store.getState().plan.items.some((i) => i.id === contributionItemId(id))).toBe(false);
    expect(store.getState().plan.goals.find((g) => g.id === id)?.monthlyContribution).toBe(0);
  });

  it('a contribution follows the goal preferred account', () => {
    const { store } = setup();
    const savings = store.getState().plan.accounts.find((a) => a.type === 'savings')!;
    const id = addEssentialGoal(store);
    store.getState().setGoalContribution(id, cents(25000));
    store.getState().updateGoal(id, { preferredAccountId: savings.id });

    expect(
      store.getState().plan.items.find((i) => i.id === contributionItemId(id))?.accountId,
    ).toBe(savings.id);
  });

  it('deleting a goal removes its contribution item and its protection', () => {
    const { store } = setup();
    const beforeProtected = store.getState().baseline.metrics.protectedFunds;
    const id = addEssentialGoal(store);
    store.getState().updateGoal(id, { reservedAmount: cents(300000) });
    store.getState().setGoalContribution(id, cents(10000));

    store.getState().removeGoal(id);

    expect(store.getState().plan.goals.some((g) => g.id === id)).toBe(false);
    expect(store.getState().plan.items.some((i) => i.goalId === id)).toBe(false);
    expect(store.getState().baseline.metrics.protectedFunds).toBe(beforeProtected);
  });

  it('an inactive goal is excluded from protection and progress', () => {
    const { store } = setup();
    const before = store.getState().baseline.metrics.protectedFunds;
    const id = addEssentialGoal(store);
    store.getState().updateGoal(id, { reservedAmount: cents(300000) });
    store.getState().updateGoal(id, { active: false });

    expect(store.getState().baseline.metrics.protectedFunds).toBe(before);
    expect(
      store.getState().baseline.months[0]!.goalProgress.some((p) => p.goalId === id),
    ).toBe(false);
  });

  it('goals and contributions survive a reload', () => {
    const adapter = new MemoryStorageAdapter();
    const store = createPlanStore(adapter);
    const id = store.getState().addGoal();
    store.getState().updateGoal(id, {
      name: 'Michigan trip',
      targetAmount: cents(120000),
      reservedAmount: cents(20000),
    });
    store.getState().setGoalContribution(id, cents(15000));

    const reopened = createPlanStore(adapter);
    const goal = reopened.getState().plan.goals.find((g) => g.id === id);
    expect(goal?.name).toBe('Michigan trip');
    expect(goal?.reservedAmount).toBe(20000);
    expect(goal?.monthlyContribution).toBe(15000);
    expect(reopened.getState().plan.items.some((i) => i.id === contributionItemId(id))).toBe(true);
  });
});
