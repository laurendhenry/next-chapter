import { ZERO, addCents, clampAtZero, minCents, subCents, sumCents, type Cents } from '../types/money';
import type { Account, AccountType, Goal } from '../types/plan';

/**
 * Liquidity behaviour is DERIVED from `Account.type`, never stored on the account.
 * That prevents an account from drifting out of sync with its own rules.
 */
export type LiquidityBucket = 'fully_liquid' | 'near_liquid' | 'volatile' | 'debt';

export type LiquidityRule = {
  bucket: LiquidityBucket;
  countsInAssets: boolean;
  /** true = whole balance counts toward planning funds; 'partial' = only the approved slice. */
  inPlanningFunds: boolean | 'partial';
};

export const LIQUIDITY: Record<AccountType, LiquidityRule> = {
  checking: { bucket: 'fully_liquid', countsInAssets: true, inPlanningFunds: true },
  savings: { bucket: 'fully_liquid', countsInAssets: true, inPlanningFunds: true },
  high_yield: { bucket: 'near_liquid', countsInAssets: true, inPlanningFunds: true },
  invested: { bucket: 'volatile', countsInAssets: true, inPlanningFunds: 'partial' },
  credit_card: { bucket: 'debt', countsInAssets: false, inPlanningFunds: false },
};

export function liquidityOf(type: AccountType): LiquidityRule {
  return LIQUIDITY[type];
}

export function liquidityLabel(type: AccountType): string {
  switch (LIQUIDITY[type].bucket) {
    case 'fully_liquid':
      return 'Fully liquid';
    case 'near_liquid':
      return 'Near-liquid';
    case 'volatile':
      return 'Volatile';
    case 'debt':
      return 'Debt';
  }
}

/** A snapshot of every balance, keyed by account id. */
export type BalanceMap = Record<string, Cents>;

export function balanceOf(balances: BalanceMap, accountId: string): Cents {
  return balances[accountId] ?? ZERO;
}

export function openingBalances(accounts: readonly Account[]): BalanceMap {
  const out: BalanceMap = {};
  for (const a of accounts) out[a.id] = a.balance;
  return out;
}

/**
 * MVP rule (plan §4.4 note): with a month-level model there is no bill due DATE to compare a
 * transfer delay against, so every high-yield account counts as immediately available.
 * Isolated here on purpose so a day-level check drops in later without touching the engine.
 */
export function isImmediatelyAvailable(account: Account): boolean {
  switch (account.type) {
    case 'checking':
    case 'savings':
      return true;
    case 'high_yield':
      return (account.transferDelayDays ?? 3) <= 3;
    default:
      return false;
  }
}

/** How much of an `invested` account the user has approved for use. Default 0. */
export function approvedInvested(account: Account): Cents {
  if (account.type !== 'invested') return ZERO;
  return clampAtZero(account.scenarioAvailableAmount ?? ZERO);
}

export type BalanceBuckets = {
  totalAssets: Cents;
  fullyLiquid: Cents;
  nearLiquid: Cents;
  invested: Cents;
  creditCardDebt: Cents;
  netWorth: Cents;
  planningFunds: Cents;
  immediateBillPayFunds: Cents;
};

/**
 * @param approvedOverride  Remaining approved invested amount per account. The forecast loop
 *   passes this so that money already sold during the forecast is not offered twice.
 */
export function computeBuckets(
  accounts: readonly Account[],
  balances: BalanceMap,
  approvedOverride?: Record<string, Cents>,
): BalanceBuckets {
  let fullyLiquid = 0;
  let nearLiquid = 0;
  let invested = 0;
  let creditCardDebt = 0;
  let approvedSlice = 0;
  let billPay = 0;

  for (const account of accounts) {
    const balance = balanceOf(balances, account.id);
    switch (LIQUIDITY[account.type].bucket) {
      case 'fully_liquid':
        fullyLiquid += balance;
        break;
      case 'near_liquid':
        nearLiquid += balance;
        break;
      case 'volatile':
        invested += balance;
        // Never count more than what is actually left in the account.
        approvedSlice += Math.max(
          0,
          Math.min(balance, approvedOverride?.[account.id] ?? approvedInvested(account)),
        );
        break;
      case 'debt':
        creditCardDebt += balance;
        break;
    }
    if (isImmediatelyAvailable(account)) billPay += balance;
  }

  const totalAssets = addCents(
    fullyLiquid as Cents,
    nearLiquid as Cents,
    invested as Cents,
  );

  return {
    totalAssets,
    fullyLiquid: fullyLiquid as Cents,
    nearLiquid: nearLiquid as Cents,
    invested: invested as Cents,
    creditCardDebt: creditCardDebt as Cents,
    netWorth: subCents(totalAssets, creditCardDebt as Cents),
    planningFunds: addCents(fullyLiquid as Cents, nearLiquid as Cents, approvedSlice as Cents),
    immediateBillPayFunds: billPay as Cents,
  };
}

export function totalOfType(
  accounts: readonly Account[],
  balances: BalanceMap,
  type: AccountType,
): Cents {
  return sumCents(accounts.filter((a) => a.type === type).map((a) => balanceOf(balances, a.id)));
}

/**
 * Protected funds = money already spoken for.
 *   Σ(reserved on active ESSENTIAL goals) + this month's required outflows.
 * Reservations are capped at the goal target so an over-reserved goal cannot inflate this.
 */
export function computeProtectedFunds(
  goals: readonly Goal[],
  reserved: Record<string, Cents>,
  requiredOutflowsThisMonth: Cents,
): Cents {
  let total = 0;
  for (const goal of goals) {
    if (!goal.active || goal.priority !== 'essential') continue;
    const held = reserved[goal.id] ?? goal.reservedAmount;
    total += clampAtZero(minCents(held, goal.targetAmount));
  }
  return addCents(total as Cents, requiredOutflowsThisMonth);
}

export function computeFlexibleFunds(planningFunds: Cents, protectedFunds: Cents): Cents {
  return clampAtZero(subCents(planningFunds, protectedFunds));
}
