import { describe, expect, it } from 'vitest';
import { ZERO } from '../../types/money';
import {
  activeGoals,
  cappedContribution,
  goalFundingGap,
  isUnderfundedAt,
  monthsRemaining,
  requiredMonthlyContribution,
  sortGoals,
} from '../goals';
import { d, goal } from './fixtures';

describe('funding gap', () => {
  it('is target minus reserved', () => {
    expect(goalFundingGap(d(5000), d(1500))).toBe(d(3500));
  });

  it('is zero — never negative — when the goal is over-funded', () => {
    expect(goalFundingGap(d(5000), d(7000))).toBe(ZERO);
    expect(goalFundingGap(d(5000), d(5000))).toBe(ZERO);
  });
});

describe('months remaining', () => {
  it('counts forward', () => {
    expect(monthsRemaining('2026-09', '2027-08')).toBe(11);
    expect(monthsRemaining('2026-09', '2026-10')).toBe(1);
  });

  it('is zero at the deadline and negative past it', () => {
    expect(monthsRemaining('2026-09', '2026-09')).toBe(0);
    expect(monthsRemaining('2026-09', '2026-06')).toBe(-3);
  });

  it('degrades to 0 for an invalid key instead of NaN', () => {
    expect(monthsRemaining('bad', '2026-09')).toBe(0);
  });
});

describe('required monthly contribution', () => {
  it('divides the gap over the remaining months, rounding UP', () => {
    // gap 1000.00 over 3 months = 333.34 (not 333.33) so the goal is never short
    expect(requiredMonthlyContribution(d(1000), ZERO, '2026-09', '2026-12')).toBe(33334);
    expect(requiredMonthlyContribution(d(3600), ZERO, '2026-09', '2027-09')).toBe(d(300));
  });

  it('subtracts what is already reserved', () => {
    expect(requiredMonthlyContribution(d(5000), d(2000), '2026-09', '2026-12')).toBe(d(1000));
  });

  it('returns zero when the goal is already funded', () => {
    expect(requiredMonthlyContribution(d(5000), d(5000), '2026-09', '2027-01')).toBe(ZERO);
    expect(requiredMonthlyContribution(d(5000), d(9000), '2026-09', '2027-01')).toBe(ZERO);
  });

  describe('a target month in the past or present does NOT divide by zero', () => {
    it('reports the whole remaining gap when the deadline is this month', () => {
      expect(requiredMonthlyContribution(d(5000), d(1500), '2026-09', '2026-09')).toBe(d(3500));
    });

    it('reports the whole remaining gap when the deadline has passed', () => {
      const result = requiredMonthlyContribution(d(5000), d(1500), '2026-09', '2026-03');
      expect(result).toBe(d(3500));
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('is finite for a badly formed target month too', () => {
      const result = requiredMonthlyContribution(d(5000), ZERO, '2026-09', 'garbage');
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBe(d(5000));
    });
  });
});

describe('contributions are capped at the target', () => {
  it('never funds a goal past its own target', () => {
    expect(cappedContribution(d(1000), d(5000), d(4500))).toBe(d(500));
  });

  it('is zero once the goal is full', () => {
    expect(cappedContribution(d(1000), d(5000), d(5000))).toBe(ZERO);
    expect(cappedContribution(d(1000), d(5000), d(6000))).toBe(ZERO);
  });

  it('passes the full amount through when there is room', () => {
    expect(cappedContribution(d(1000), d(5000), d(1000))).toBe(d(1000));
  });
});

describe('active goals', () => {
  const goals = [
    goal({ id: 'a', active: true }),
    goal({ id: 'b', active: false }),
    goal({ id: 'c', active: true }),
  ];

  it('excludes deferred and cancelled goals from the math', () => {
    expect(activeGoals(goals).map((g) => g.id)).toEqual(['a', 'c']);
  });

  it('an inactive goal is never reported as underfunded', () => {
    const inactive = goal({
      id: 'x',
      active: false,
      targetAmount: d(5000),
      targetMonth: '2027-01',
    });
    expect(isUnderfundedAt(inactive, ZERO, '2027-01')).toBe(false);
  });

  it('flags an active goal short at its deadline month only', () => {
    const g = goal({ id: 'x', targetAmount: d(5000), targetMonth: '2027-01' });
    expect(isUnderfundedAt(g, d(1000), '2027-01')).toBe(true);
    expect(isUnderfundedAt(g, d(5000), '2027-01')).toBe(false);
    expect(isUnderfundedAt(g, d(1000), '2026-12')).toBe(false);
  });
});

describe('sorting for display', () => {
  it('orders essential first, then by deadline, then by name', () => {
    const sorted = sortGoals([
      goal({ id: '1', name: 'Cruise', priority: 'optional', targetMonth: '2027-03' }),
      goal({ id: '2', name: 'Move', priority: 'essential', targetMonth: '2027-08' }),
      goal({ id: '3', name: 'Emergency', priority: 'essential', targetMonth: '2027-05' }),
      goal({ id: '4', name: 'Michigan', priority: 'important', targetMonth: '2027-06' }),
    ]);
    expect(sorted.map((g) => g.name)).toEqual(['Emergency', 'Move', 'Michigan', 'Cruise']);
  });
});
