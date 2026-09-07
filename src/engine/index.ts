import { ZERO, addCents, cents, clampAtZero, minCents, type Cents } from '../types/money';
import type {
  ForecastLineItem,
  ForecastResult,
  GoalProgress,
  InvestedDraw,
  MonthResult,
} from '../types/forecast';
import type { Account, AccountType, Plan, Settings } from '../types/plan';
import {
  approvedInvested,
  computeBuckets,
  computeFlexibleFunds,
  computeProtectedFunds,
  openingBalances,
  totalOfType,
  type BalanceMap,
} from './balances';
import { cappedContribution, monthsRemaining, requiredMonthlyContribution } from './goals';
import { expandItems, isExpense, orderItems, type ResolvedItem } from './items';
import { computeMetrics } from './metrics';
import { generateMonths } from './months';
import { evaluateShortfalls, type ShortfallContext } from './shortfalls';

export * from './months';
export * from './balances';
export * from './goals';
export * from './items';
export * from './metrics';
export * from './scenario';
export * from './shortfalls';

/** The order the engine drains accounts when one would go negative (plan §4.2f). */
const DRAIN_ORDER: AccountType[] = ['checking', 'savings', 'high_yield', 'invested'];

const EMPTY_METRICS_INPUT_MONTHS: MonthResult[] = [];

/**
 * runForecast — the single public entry point of the engine.
 *
 * PURE. No `Date.now()`, no `localStorage`, no network, no randomness, never throws.
 * Bad input produces `warnings`, not exceptions.
 */
export function runForecast(plan: Plan, settings: Settings): ForecastResult {
  const monthKeys = generateMonths(settings.startMonth, settings.horizonMonths);
  const { byMonth, warnings } = expandItems(plan, monthKeys);

  if (monthKeys.length === 0) {
    warnings.unshift(
      `Cannot build a forecast: start month "${settings.startMonth}" or horizon ` +
        `"${settings.horizonMonths}" is invalid.`,
    );
  }

  const accounts = plan.accounts;
  const accountById = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  const defaultAccountId =
    accounts.find((a) => a.type === 'checking')?.id ?? accounts[0]?.id ?? '';

  const balances: BalanceMap = openingBalances(accounts);
  const approvedRemaining: Record<string, Cents> = {};
  for (const account of accounts) {
    if (account.type === 'invested') approvedRemaining[account.id] = approvedInvested(account);
  }
  const reserved: Record<string, Cents> = {};
  for (const goal of plan.goals) reserved[goal.id] = goal.reservedAmount;

  const openingBuckets = computeBuckets(accounts, balances, approvedRemaining);
  const firstMonthRequired = sumRequired(byMonth.get(monthKeys[0] ?? '') ?? []);
  const openingProtected = computeProtectedFunds(plan.goals, reserved, firstMonthRequired);
  const openingFlexible = computeFlexibleFunds(openingBuckets.planningFunds, openingProtected);

  const months: MonthResult[] = [];

  for (const month of monthKeys) {
    const items = orderItems(byMonth.get(month) ?? []);
    const opening = computeBuckets(accounts, balances, approvedRemaining);
    const investedDraws: InvestedDraw[] = [];
    const lineItems: ForecastLineItem[] = [];

    let income = 0;
    let requiredOutflows = 0;
    let discretionaryOutflows = 0;
    let goalContributions = 0;
    let netTransfers = 0;
    let creditCardPayments = 0;
    let largestRequired = 0;
    let largestRequiredItemLabel: string | null = null;

    const balanceAt = (accountId: string): Cents => balances[accountId] ?? ZERO;
    const setBalance = (accountId: string, value: Cents) => {
      balances[accountId] = value;
    };

    /** Find the next account the engine is allowed to drain from. */
    const findDonor = (
      excludeId: string,
      allowInvested: boolean,
    ): { account: Account; available: Cents } | null => {
      for (const type of DRAIN_ORDER) {
        if (type === 'invested' && !allowInvested) continue;
        for (const account of accounts) {
          if (account.type !== type || account.id === excludeId) continue;
          const balance = balanceAt(account.id);
          if (balance <= 0) continue;
          const available =
            type === 'invested'
              ? minCents(balance, clampAtZero(approvedRemaining[account.id] ?? ZERO))
              : balance;
          if (available > 0) return { account, available };
        }
      }
      return null;
    };

    /**
     * Step 4f of the algorithm: if an account went negative, pull from other accounts in a
     * fixed order. Invested money is only ever sold up to the amount the user approved, and
     * every sale is recorded so rule 6 can surface it.
     */
    const coverNegative = (accountId: string, reason: string, allowInvested: boolean) => {
      let guard = 0;
      while (balanceAt(accountId) < 0 && guard < accounts.length + 1) {
        guard += 1;
        const need = cents(-balanceAt(accountId));
        const donor = findDonor(accountId, allowInvested);
        if (!donor) break;
        const take = minCents(need, donor.available);
        if (take <= 0) break;
        setBalance(donor.account.id, cents(balanceAt(donor.account.id) - take));
        setBalance(accountId, cents(balanceAt(accountId) + take));
        if (donor.account.type === 'invested') {
          approvedRemaining[donor.account.id] = clampAtZero(
            cents((approvedRemaining[donor.account.id] ?? ZERO) - take),
          );
          investedDraws.push({ accountId: donor.account.id, amount: take, reason });
        }
      }
    };

    const applyInflow = (accountId: string, amount: Cents) => {
      setBalance(accountId, cents(balanceAt(accountId) + amount));
    };

    const applyOutflow = (
      accountId: string,
      amount: Cents,
      reason: string,
      allowInvested: boolean,
    ) => {
      const account = accountById.get(accountId);
      // Spending ON a credit card increases debt; it does not move cash this month.
      if (account?.type === 'credit_card') {
        setBalance(accountId, cents(balanceAt(accountId) + amount));
        return;
      }
      setBalance(accountId, cents(balanceAt(accountId) - amount));
      coverNegative(accountId, reason, allowInvested);
    };

    const targetAccount = (item: ResolvedItem): string => item.accountId ?? defaultAccountId;

    for (const item of items) {
      const applied = applyItem(item);
      lineItems.push({
        itemId: item.itemId,
        label: item.label,
        amount: applied,
        kind: item.kind,
        required: item.required,
        ...(item.accountId ? { accountId: item.accountId } : {}),
      });
    }

    function applyItem(item: ResolvedItem): Cents {
      const amount = clampAtZero(item.amount);
      if (amount === 0) return ZERO;

      if (item.kind === 'income') {
        applyInflow(targetAccount(item), amount);
        income += amount;
        return amount;
      }

      if (item.kind === 'transfer') {
        const from = targetAccount(item);
        const to = item.toAccountId;
        if (!to) return ZERO;
        const toAccount = accountById.get(to);
        if (toAccount?.type === 'credit_card') {
          // Paying a card: never pay more than is actually owed.
          const owed = clampAtZero(balanceAt(to));
          const paid = minCents(amount, owed);
          if (paid <= 0) return ZERO;
          setBalance(to, cents(owed - paid));
          applyOutflow(from, paid, 'a credit card payment', true);
          creditCardPayments += paid;
          netTransfers += paid;
          return paid;
        }
        applyOutflow(from, amount, `the transfer "${item.label}"`, true);
        applyInflow(to, amount);
        netTransfers += amount;
        return amount;
      }

      if (item.kind === 'goal_contribution') {
        const goal = plan.goals.find((g) => g.id === item.goalId);
        if (!goal || !goal.active) return ZERO;
        const held = reserved[goal.id] ?? goal.reservedAmount;
        const contribution = cappedContribution(amount, goal.targetAmount, held);
        if (contribution <= 0) return ZERO;
        const source = item.accountId ?? goal.preferredAccountId ?? defaultAccountId;
        // When `goalsMayReserveInvested` is false a goal may never cause an invested sale.
        applyOutflow(
          source,
          contribution,
          `funding the goal "${goal.name}"`,
          settings.goalsMayReserveInvested,
        );
        reserved[goal.id] = addCents(held, contribution);
        goalContributions += contribution;
        return contribution;
      }

      // recurring_expense | one_time_expense | trip_payment
      if (isExpense(item.kind)) {
        const reason = item.isMoveInCost
          ? 'move-in costs'
          : item.required
            ? `the required expense "${item.label}"`
            : `the discretionary expense "${item.label}"`;
        applyOutflow(targetAccount(item), amount, reason, true);
        if (item.required) {
          requiredOutflows += amount;
          if (amount > largestRequired) {
            largestRequired = amount;
            largestRequiredItemLabel = item.label;
          }
        } else {
          discretionaryOutflows += amount;
        }
        // A trip payment also counts as progress toward its goal.
        if (item.kind === 'trip_payment' && item.goalId) {
          const goal = plan.goals.find((g) => g.id === item.goalId);
          if (goal?.active) {
            const held = reserved[goal.id] ?? goal.reservedAmount;
            reserved[goal.id] = addCents(held, cappedContribution(amount, goal.targetAmount, held));
          }
        }
        return amount;
      }

      return ZERO;
    }

    const ending = computeBuckets(accounts, balances, approvedRemaining);
    const requiredOutflowsCents = cents(requiredOutflows);
    const protectedFunds = computeProtectedFunds(plan.goals, reserved, requiredOutflowsCents);

    const goalProgress: GoalProgress[] = plan.goals
      .filter((g) => g.active)
      .map((goal) => {
        const held = reserved[goal.id] ?? goal.reservedAmount;
        const gap = clampAtZero(cents(goal.targetAmount - held));
        return {
          goalId: goal.id,
          name: goal.name,
          reserved: held,
          target: goal.targetAmount,
          gap,
          requiredMonthlyContribution: requiredMonthlyContribution(
            goal.targetAmount,
            held,
            month,
            goal.targetMonth,
          ),
          monthsRemaining: monthsRemaining(month, goal.targetMonth),
        };
      });

    const ctx: ShortfallContext = {
      month,
      accounts,
      settings,
      endingBalances: { ...balances },
      endingPlanningFunds: ending.planningFunds,
      endingBillPayFunds: ending.immediateBillPayFunds,
      availableBillPayDuringMonth: addCents(opening.immediateBillPayFunds, cents(income)),
      requiredOutflows: requiredOutflowsCents,
      creditCardPayments: cents(creditCardPayments),
      goals: plan.goals,
      reserved,
      investedDraws,
      largestRequiredItemLabel,
    };

    months.push({
      month,
      openingPlanningFunds: opening.planningFunds,
      openingBillPayFunds: opening.immediateBillPayFunds,
      income: cents(income),
      requiredOutflows: requiredOutflowsCents,
      discretionaryOutflows: cents(discretionaryOutflows),
      goalContributions: cents(goalContributions),
      netTransfers: cents(netTransfers),
      creditCardPayments: cents(creditCardPayments),
      endingPlanningFunds: ending.planningFunds,
      endingByAccount: { ...balances },
      endingFullyLiquid: ending.fullyLiquid,
      endingNearLiquid: ending.nearLiquid,
      endingInvested: ending.invested,
      endingBillPayFunds: ending.immediateBillPayFunds,
      endingCreditCardDebt: ending.creditCardDebt,
      protectedFunds,
      flexibleFunds: computeFlexibleFunds(ending.planningFunds, protectedFunds),
      goalProgress,
      investedDraws,
      shortfalls: evaluateShortfalls(ctx),
      lineItems,
    });
  }

  const metrics = computeMetrics({
    plan,
    settings,
    months: months.length > 0 ? months : EMPTY_METRICS_INPUT_MONTHS,
    monthKeys,
    openingBuckets,
    openingProtected,
    openingFlexible,
  });

  return {
    months,
    metrics,
    shortfalls: months.flatMap((m) => m.shortfalls),
    warnings,
  };
}

function sumRequired(items: readonly ResolvedItem[]): Cents {
  let total = 0;
  for (const item of items) {
    if (isExpense(item.kind) && item.required) total += item.amount;
  }
  return cents(total);
}

/** Convenience re-export used by the UI for the "lowest checking" callout. */
export { totalOfType };
