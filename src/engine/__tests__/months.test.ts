import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareMonths,
  formatMonth,
  fromOrdinal,
  generateMonths,
  isOnOrAfter,
  isOnOrBefore,
  isValidMonthKey,
  monthDiff,
  monthKey,
  monthOrdinal,
  parseMonth,
} from '../months';

describe('month key validation', () => {
  it('accepts well-formed keys', () => {
    expect(isValidMonthKey('2026-09')).toBe(true);
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-12')).toBe(true);
  });

  it('rejects malformed keys', () => {
    for (const bad of ['2026-13', '2026-00', '2026-9', '26-09', '', 'nope', '2026/09']) {
      expect(isValidMonthKey(bad)).toBe(false);
      expect(parseMonth(bad)).toBeNull();
      expect(monthOrdinal(bad)).toBeNull();
    }
  });
});

describe('month arithmetic', () => {
  it('adds months without rolling the year incorrectly', () => {
    expect(addMonths('2026-09', 1)).toBe('2026-10');
    expect(addMonths('2026-09', 3)).toBe('2026-12');
    expect(addMonths('2026-09', 4)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('rolls the year over both directions across many steps', () => {
    expect(addMonths('2026-09', 12)).toBe('2027-09');
    expect(addMonths('2026-09', 24)).toBe('2028-09');
    expect(addMonths('2026-09', -12)).toBe('2025-09');
    expect(addMonths('2026-09', -21)).toBe('2024-12');
  });

  it('returns the input unchanged for an invalid key', () => {
    expect(addMonths('garbage', 3)).toBe('garbage');
  });

  it('diffs months, signed', () => {
    expect(monthDiff('2026-09', '2026-09')).toBe(0);
    expect(monthDiff('2026-09', '2026-12')).toBe(3);
    expect(monthDiff('2026-09', '2027-08')).toBe(11);
    expect(monthDiff('2027-08', '2026-09')).toBe(-11);
    expect(monthDiff('bad', '2026-09')).toBeNull();
  });

  it('round-trips through the ordinal representation', () => {
    for (const key of ['2024-01', '2026-09', '2027-12', '2030-06']) {
      const ord = monthOrdinal(key);
      expect(ord).not.toBeNull();
      expect(fromOrdinal(ord as number)).toBe(key);
    }
  });

  it('builds keys with zero padding', () => {
    expect(monthKey(2026, 9)).toBe('2026-09');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });
});

describe('comparison', () => {
  it('orders months', () => {
    expect(compareMonths('2026-09', '2026-10')).toBe(-1);
    expect(compareMonths('2026-10', '2026-09')).toBe(1);
    expect(compareMonths('2026-09', '2026-09')).toBe(0);
  });

  it('sorts invalid keys last', () => {
    expect(compareMonths('bad', '2026-09')).toBe(1);
    expect(compareMonths('2026-09', 'bad')).toBe(-1);
    expect(compareMonths('bad', 'worse')).toBe(0);
  });

  it('supports inclusive bounds', () => {
    expect(isOnOrAfter('2026-09', '2026-09')).toBe(true);
    expect(isOnOrAfter('2026-08', '2026-09')).toBe(false);
    expect(isOnOrBefore('2026-09', '2026-09')).toBe(true);
    expect(isOnOrBefore('2026-10', '2026-09')).toBe(false);
  });
});

describe('horizon generation', () => {
  it('generates exactly N consecutive months', () => {
    const months = generateMonths('2026-09', 18);
    expect(months).toHaveLength(18);
    expect(months[0]).toBe('2026-09');
    expect(months[3]).toBe('2026-12');
    expect(months[4]).toBe('2027-01');
    expect(months[17]).toBe('2028-02');
    // every entry is unique and ascending
    for (let i = 1; i < months.length; i += 1) {
      expect(compareMonths(months[i - 1] as string, months[i] as string)).toBe(-1);
    }
  });

  it('returns an empty horizon for bad input instead of throwing', () => {
    expect(generateMonths('nope', 18)).toEqual([]);
    expect(generateMonths('2026-09', 0)).toEqual([]);
    expect(generateMonths('2026-09', -4)).toEqual([]);
    expect(generateMonths('2026-09', Number.NaN)).toEqual([]);
  });
});

describe('formatting', () => {
  it('renders a human label', () => {
    expect(formatMonth('2026-09')).toBe('Sep 2026');
    expect(formatMonth('2027-01')).toBe('Jan 2027');
  });

  it('passes through an unparseable key', () => {
    expect(formatMonth('2026-99')).toBe('2026-99');
  });
});
