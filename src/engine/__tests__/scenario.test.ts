import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import { isEmptyOverrides, resolvePlan } from '../scenario';
import { ACC, d, goal, housing, item, plan, settings, standardAccounts } from './fixtures';

function basePlan() {
  return plan({
    accounts: standardAccounts({ checking: d(3000), go: d(5000) }, { approved: d(1000), delay: 2 }),
    items: [
      item({ id: 'inc', kind: 'income', amount: d(2000), startMonth: '2026-09' }),
      item({ id: 'rent-ish', kind: 'recurring_expense', amount: d(400), required: true }),
    ],
    goals: [
      goal({ id: 'trip', targetAmount: d(1200), priority: 'optional' }),
      goal({ id: 'move', targetAmount: d(6000), priority: 'essential' }),
    ],
    housing: [housing({ id: 'lease', monthlyRent: d(1200), endMonth: '2027-07' })],
  });
}

describe('patching', () => {
  it('applies a partial patch and keeps every untouched field', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      itemPatches: { inc: { amount: d(3500), startMonth: '2027-01' } },
    });
    const inc = resolved.items.find((i) => i.id === 'inc');
    expect(inc?.amount).toBe(d(3500));
    expect(inc?.startMonth).toBe('2027-01');
    expect(inc?.kind).toBe('income');
    expect(inc?.label).toBe('inc');
  });

  it('never lets a patch change an id', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      itemPatches: { inc: { id: 'hijacked' } },
    });
    expect(resolved.items.map((i) => i.id)).toContain('inc');
    expect(resolved.items.map((i) => i.id)).not.toContain('hijacked');
  });

  it('a null patch REMOVES the entity in that scenario', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      itemPatches: { inc: null },
      goalPatches: { trip: null },
      housingPatches: { lease: null },
    });
    expect(resolved.items.map((i) => i.id)).toEqual(['rent-ish']);
    expect(resolved.goals.map((g) => g.id)).toEqual(['move']);
    expect(resolved.housing).toEqual([]);
  });

  it('additions append', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      addedItems: [item({ id: 'trip-pay', kind: 'trip_payment', amount: d(600) })],
      addedGoals: [goal({ id: 'cruise', targetAmount: d(2200) })],
      addedHousing: [housing({ id: 'atl', monthlyRent: d(1500), startMonth: '2027-08' })],
    });
    expect(resolved.items.map((i) => i.id)).toEqual(['inc', 'rent-ish', 'trip-pay']);
    expect(resolved.goals.map((g) => g.id)).toEqual(['trip', 'move', 'cruise']);
    expect(resolved.housing.map((h) => h.id)).toEqual(['lease', 'atl']);
  });

  it('an addition with a colliding id replaces rather than duplicating', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      addedItems: [item({ id: 'inc', kind: 'income', amount: d(99) })],
    });
    expect(resolved.items.filter((i) => i.id === 'inc')).toHaveLength(1);
    expect(resolved.items.find((i) => i.id === 'inc')?.amount).toBe(d(99));
  });

  it('merges settings overrides on top of the base settings', () => {
    const { settings: resolved } = resolvePlan(basePlan(), settings({ checkingFloor: d(1000) }), {
      settings: { checkingFloor: d(2500) },
    });
    expect(resolved.checkingFloor).toBe(d(2500));
    expect(resolved.horizonMonths).toBe(18);
    expect(resolved.startMonth).toBe('2026-09');
  });
});

describe('account availability and transfer delay overrides', () => {
  it('unlocks a different amount of invested money', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      accountAvailability: { [ACC.go]: d(4000) },
    });
    expect(resolved.accounts.find((a) => a.id === ACC.go)?.scenarioAvailableAmount).toBe(d(4000));
  });

  it('clamps a negative availability at zero', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      accountAvailability: { [ACC.go]: d(-500) },
    });
    expect(resolved.accounts.find((a) => a.id === ACC.go)?.scenarioAvailableAmount).toBe(ZERO);
  });

  it('ignores availability on accounts that are not invested', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      accountAvailability: { [ACC.checking]: d(9999) },
    });
    expect(resolved.accounts.find((a) => a.id === ACC.checking)?.scenarioAvailableAmount).toBeUndefined();
  });

  it('changes the high-yield transfer delay', () => {
    const { plan: resolved } = resolvePlan(basePlan(), settings(), {
      transferDelayDays: { [ACC.hy]: 1 },
    });
    expect(resolved.accounts.find((a) => a.id === ACC.hy)?.transferDelayDays).toBe(1);
  });
});

describe('the baseline scenario is a no-op', () => {
  it('resolves to a deep-equal plan when overrides are empty', () => {
    const base = basePlan();
    const { plan: resolved, settings: s } = resolvePlan(base, settings(), {});
    expect(resolved).toEqual(base);
    expect(s).toEqual(settings());
  });

  it('handles undefined overrides', () => {
    const base = basePlan();
    expect(resolvePlan(base, settings(), undefined).plan).toEqual(base);
  });

  it('recognises empty overrides', () => {
    expect(isEmptyOverrides(undefined)).toBe(true);
    expect(isEmptyOverrides({})).toBe(true);
    expect(isEmptyOverrides({ addedItems: [], itemPatches: {} })).toBe(true);
    expect(isEmptyOverrides({ itemPatches: { inc: null } })).toBe(false);
  });
});

describe('IMMUTABILITY: resolving a scenario never mutates the base plan', () => {
  it('leaves the base plan byte-identical after aggressive overrides', () => {
    const base = basePlan();
    const snapshot = structuredClone(base);
    const baseSettings = settings({ checkingFloor: d(1000) });
    const settingsSnapshot = structuredClone(baseSettings);

    resolvePlan(base, baseSettings, {
      settings: { checkingFloor: d(9999), horizonMonths: 6 },
      accountAvailability: { [ACC.go]: d(5000) },
      transferDelayDays: { [ACC.hy]: 1 },
      itemPatches: { inc: { amount: d(1) }, 'rent-ish': null },
      addedItems: [item({ id: 'new', kind: 'income', amount: d(50) })],
      goalPatches: { trip: { active: false }, move: null },
      addedGoals: [goal({ id: 'newgoal' })],
      housingPatches: { lease: { monthlyRent: d(1) } },
      addedHousing: [housing({ id: 'newhouse' })],
    });

    expect(base).toEqual(snapshot);
    expect(baseSettings).toEqual(settingsSnapshot);
  });

  it('returns new object identities so later edits cannot leak backwards', () => {
    const base = basePlan();
    const { plan: resolved } = resolvePlan(base, settings(), {
      itemPatches: { inc: { amount: d(1) } },
    });
    expect(resolved).not.toBe(base);
    expect(resolved.items).not.toBe(base.items);
    expect(resolved.items.find((i) => i.id === 'inc')).not.toBe(
      base.items.find((i) => i.id === 'inc'),
    );
  });

  it('two scenarios resolved from the same base do not see each other', () => {
    const base = basePlan();
    const a = resolvePlan(base, settings(), { itemPatches: { inc: { amount: d(1000) } } });
    const b = resolvePlan(base, settings(), { itemPatches: { inc: { amount: d(9000) } } });
    expect(a.plan.items.find((i) => i.id === 'inc')?.amount).toBe(d(1000));
    expect(b.plan.items.find((i) => i.id === 'inc')?.amount).toBe(d(9000));
    expect(base.items.find((i) => i.id === 'inc')?.amount).toBe(d(2000));
  });
});
