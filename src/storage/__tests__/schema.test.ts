import { describe, expect, it } from 'vitest';
import { cents } from '../../types/money';
import { defaults } from '../../store/usePlanStore';
import {
  SCHEMA_VERSION,
  deserializeDocument,
  parseDocument,
  parsePlan,
  parseSettings,
  serializeDocument,
} from '../schema';
import { LocalStorageAdapter, MemoryStorageAdapter } from '../LocalStorageAdapter';

describe('parseDocument', () => {
  it('returns null for values that are not objects', () => {
    for (const bad of [null, undefined, 3, 'hi', [], true]) {
      expect(parseDocument(bad, defaults())).toBeNull();
    }
  });

  it('returns null when the plan has no readable accounts', () => {
    expect(parseDocument({ plan: { accounts: [] } }, defaults())).toBeNull();
    expect(parseDocument({ plan: { accounts: [{ name: 'no id' }] } }, defaults())).toBeNull();
  });

  it('keeps valid entities and drops unreadable ones', () => {
    const doc = parseDocument(
      {
        schemaVersion: 1,
        settings: { startMonth: '2026-09', horizonMonths: 18 },
        plan: {
          accounts: [
            { id: 'a', name: 'Checking', type: 'checking', balance: 150000 },
            { id: '', name: 'dropped' },
            'nonsense',
          ],
          items: [
            { id: 'i1', kind: 'income', label: 'Job', amount: 300000, startMonth: '2026-09' },
            { nope: true },
          ],
          goals: [],
          housing: [],
        },
      },
      defaults(),
    );
    expect(doc).not.toBeNull();
    expect(doc?.plan.accounts).toHaveLength(1);
    expect(doc?.plan.items).toHaveLength(1);
    expect(doc?.plan.accounts[0]?.balance).toBe(150000);
  });

  it('replaces invalid field values with safe defaults instead of failing', () => {
    const doc = parseDocument(
      {
        plan: {
          accounts: [{ id: 'a', name: 42, type: 'crypto', balance: 'lots' }],
          items: [
            { id: 'i', kind: 'wat', label: 'x', amount: Number.NaN, startMonth: '2026-13' },
          ],
        },
        settings: { startMonth: 'nope', horizonMonths: -5, emergencyTargetMode: 'vibes' },
      },
      defaults(),
    );
    const seed = defaults();
    expect(doc?.plan.accounts[0]?.type).toBe('checking');
    expect(doc?.plan.accounts[0]?.balance).toBe(0);
    expect(doc?.plan.items[0]?.kind).toBe('recurring_expense');
    expect(doc?.plan.items[0]?.startMonth).toBe(seed.settings.startMonth);
    expect(doc?.settings.startMonth).toBe(seed.settings.startMonth);
    expect(doc?.settings.horizonMonths).toBe(1);
    expect(doc?.settings.emergencyTargetMode).toBe(seed.settings.emergencyTargetMode);
  });

  it('falls back to the seeded scenarios when stored scenarios are missing', () => {
    const doc = parseDocument(
      { plan: { accounts: [{ id: 'a', type: 'checking', balance: 0 }] } },
      defaults(),
    );
    expect(doc?.scenarios).toHaveLength(2);
    expect(doc?.scenarios[0]?.assumptions.oneTimeCost.enabled).toBe(false);
  });

  it('round-trips through serialize/deserialize', () => {
    const seed = defaults();
    const original = {
      schemaVersion: SCHEMA_VERSION,
      plan: seed.plan,
      settings: { ...seed.settings, checkingFloor: cents(50000) },
      scenarios: seed.scenarios,
    };
    const back = deserializeDocument(serializeDocument(original), defaults());
    expect(back?.settings.checkingFloor).toBe(50000);
    expect(back?.plan.accounts).toHaveLength(seed.plan.accounts.length);
  });

  it('returns null for text that is not JSON', () => {
    expect(deserializeDocument('{oh no', defaults())).toBeNull();
  });
});

describe('parsePlan / parseSettings', () => {
  it('parsePlan requires an accounts array', () => {
    expect(parsePlan({ accounts: 'no' }, '2026-09')).toBeNull();
  });

  it('parseSettings clamps the horizon into a usable range', () => {
    const base = defaults().settings;
    expect(parseSettings({ horizonMonths: 9999 }, base).horizonMonths).toBe(120);
    expect(parseSettings({ horizonMonths: 24 }, base).horizonMonths).toBe(24);
  });
});

describe('storage adapters', () => {
  it('MemoryStorageAdapter stores, loads and clears', () => {
    const adapter = new MemoryStorageAdapter();
    expect(adapter.load()).toBeNull();
    const seed = defaults();
    const doc = {
      schemaVersion: SCHEMA_VERSION,
      plan: seed.plan,
      settings: seed.settings,
      scenarios: seed.scenarios,
    };
    adapter.save(doc);
    expect(adapter.load()?.settings.startMonth).toBe(seed.settings.startMonth);
    adapter.clear();
    expect(adapter.load()).toBeNull();
  });

  it('LocalStorageAdapter survives corrupt stored JSON', () => {
    const backing = fakeStorage();
    backing.setItem('test-key', '{ not json');
    const adapter = new LocalStorageAdapter(defaults(), 'test-key', backing);
    expect(adapter.load()).toBeNull();
  });

  it('LocalStorageAdapter survives a storage API that throws', () => {
    const throwing = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
      clear() {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    const adapter = new LocalStorageAdapter(defaults(), 'k', throwing);
    expect(adapter.load()).toBeNull();
    const seed = defaults();
    expect(() =>
      adapter.save({
        schemaVersion: SCHEMA_VERSION,
        plan: seed.plan,
        settings: seed.settings,
        scenarios: seed.scenarios,
      }),
    ).not.toThrow();
    expect(() => adapter.clear()).not.toThrow();
  });

  it('LocalStorageAdapter round-trips a saved document', () => {
    const backing = fakeStorage();
    const adapter = new LocalStorageAdapter(defaults(), 'next-chapter:v1', backing);
    const seed = defaults();
    adapter.save({
      schemaVersion: SCHEMA_VERSION,
      plan: {
        ...seed.plan,
        accounts: seed.plan.accounts.map((a) =>
          a.type === 'checking' ? { ...a, balance: cents(250000) } : a,
        ),
      },
      settings: seed.settings,
      scenarios: seed.scenarios,
    });
    const loaded = adapter.load();
    expect(loaded?.plan.accounts.find((a) => a.type === 'checking')?.balance).toBe(250000);
  });
});

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}
