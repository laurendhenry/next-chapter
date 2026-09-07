# How Next Chapter calculates things

Every number in the app comes from one pure function: `runForecast(plan, settings)` in
`src/engine/index.ts`. It takes a plan and returns a full 18-month projection. It has no
side effects, no clock, no network, and it never throws — bad input comes back as a
`warnings: string[]` on the result instead of an exception.

This document explains what the engine does in plain language, and flags the four places
where a judgement call was made.

---

## 1. Money is stored in whole cents

All amounts are integers of cents, wrapped in a branded `Cents` type so a raw number can't
be passed where money is expected. There are no floats anywhere in the money path, so
`0.1 + 0.2` problems can't happen.

Two rounding helpers exist, and which one is used depends on who the rounding should favour:

| Helper | Rounds | Used for |
| --- | --- | --- |
| `divCentsCeil` | **Up** | Anything you _owe_ — required monthly goal contributions. Rounding up means the goal always gets there, never a penny short. |
| `divCentsFloor` | **Down** | Anything you _have_ — runway, averages. Rounding down means the app never overstates your position. |

Text entry parses in string space (`dollarsToCents('1.005')` → `101`), so typing an amount
never loses a cent to floating point.

---

## 2. Accounts, liquidity, and the three money numbers

Each account has a liquidity class:

| Class | Accounts | Meaning |
| --- | --- | --- |
| `fully_liquid` | Checking, savings | Spendable today |
| `near_liquid` | High-yield savings | Spendable after a transfer delay (days) |
| `invested` | Fidelity Go | Market-exposed; only spendable if you say so |
| `credit` | Credit cards | A debt, not an asset |

From those, three headline numbers are derived:

- **Total assets** — everything except credit.
- **Planning funds** — fully liquid + near liquid + _only the invested amount you explicitly
  approved_. This is the number the forecast actually spends. Unapproved invested money is
  never counted, so the app can't quietly plan around selling your investments.
- **Immediate bill-pay funds** — fully liquid + near-liquid accounts whose transfer delay is
  short enough to make a bill this month. This is the number the timing rules use.

**Protected vs flexible.** Protected funds = money reserved against essential goals (capped
at each goal's target) + this month's required outflows. Flexible funds = planning funds
minus protected. This is the "what can I actually play with" number.

---

## 3. How one month is simulated

Months are integer ordinals, not `Date` objects — `2026-09` is ordinal `24323`. No timezone,
no daylight saving, no month-length bugs.

Within each month, items are applied in a fixed order so results are deterministic:

1. **Income** — added to its target account.
2. **Required expenses** — rent, utilities, phone, insurance, move-in costs.
3. **Discretionary expenses** — spending money.
4. **Trip payments** — deposits and instalments tied to a trip goal.
5. **Transfers** — between your own accounts.
6. **Goal contributions** — money set aside.

Housing is expanded into synthetic items: a lease with id `atl` produces `atl::rent`,
`atl::utilities` (only when utilities aren't included), and `atl::movein` (only in the first
month of the lease). Move-in cost is the sum of seven fields: security deposit, first month's
rent, application fees, utility setup, moving/transport, furniture/household, contingency.

**When checking runs out**, the engine drains in this order and records every step:

`checking → savings → high-yield → approved invested`

The invested pool is drawn from **once**, cumulatively — if you approved $1,000 and the
forecast used $400 in March, only $600 is available in April. If money still isn't there, the
checking balance is allowed to go negative. That's deliberate: a visible hole is more useful
than a silently balanced spreadsheet.

**Credit cards** work the other way around. Spending charged to a card increases the debt and
moves no cash that month. A transfer whose destination is a card is a payment, capped at the
balance actually owed, so a $800 payment against a $500 balance moves $500.

**Goal contributions are capped at the target.** A $500/month contribution to a goal that only
needs $100 more moves $100. You cannot overshoot a goal, and inactive goals receive nothing.
Goal contributions may only draw on invested money when `goalsMayReserveInvested` is true —
the default is off, because selling investments to pre-fund a want is a decision, not a default.

---

## 4. Goal math

- **Gap** = target − reserved, floored at zero.
- **Months remaining** = target month − current month.
- **Required monthly contribution** = gap ÷ months remaining, **rounded up**.

> **Divide-by-zero guard.** When the target month is the current month or already in the past,
> months remaining is `0` or negative. The engine returns **the whole remaining gap** rather
> than dividing. It never produces `Infinity` or `NaN`. This is tested explicitly.

---

## 5. The seven shortfall rules

Each month is checked against seven independent rules. Several can fire in the same month;
each produces a shortfall with a stable id, a severity, a plain-English cause, and a list of
suggested levers.

| # | Rule | Severity | Fires when |
| --- | --- | --- | --- |
| 1 | Checking floor | Critical | Projected checking ends below your floor |
| 2 | Bill-pay timing | Critical | Required bills exceed money that can physically arrive in time |
| 3 | Planning funds negative | Critical | Total planning funds go below zero |
| 4 | Essential goal underfunded | Critical | An essential goal is short **at its deadline month** |
| 5 | Other goal underfunded | Warning | An important/optional goal is short at its deadline |
| 6 | Invested draw | Warning | The month only worked because invested money was sold |
| 7 | Card payment unreachable | Critical | A scheduled card payment exceeds reachable money |

Rules 4 and 5 are mutually exclusive and only fire in the deadline month, so a goal that's
behind doesn't scream every month for a year.

> **Judgement call — rules 2 and 7.** The model is monthly, so it has no concept of a due date
> within a month. Both rules compare against `opening bill-pay funds + this month's income`.
> That's the money that could plausibly be in the right account during the month. It's an
> approximation, and it's the conservative direction: it flags timing risk slightly more often
> than a day-level model would.

---

## 6. Metrics

**Essential monthly outflow** = average required outflows over the **first three months**,
rounded down. This is the burn rate everything else is measured against.

**Runway** comes in two flavours, both floored to one decimal:

- **Conservative** = (fully liquid + near liquid) ÷ essential monthly outflow
- **Expanded** = planning funds ÷ essential monthly outflow (includes approved invested)

> When essential outflow is `$0`, runway is `Infinity`. The UI renders that as `∞`, not as a
> number.

**Lowest points** — the single worst month for checking, for planning funds, and for bill-pay
funds, each reported with its month so you can jump straight to it.

**Emergency target** — either a fixed amount you set, or _N_ months of essentials (default 3).

**Move readiness** — compares planning funds at the end of the month **before** the move
against total move-in cost, and reports the gap.

**Potentially exposed amount** — how much near-term commitment isn't covered by cash and
near-cash:

```
committed = required bills through the horizon
          + emergency target
          + Atlanta move target
          + Σ (remaining gap on goals due within the horizon)

exposed   = max(0, committed − (fully liquid + near liquid))
```

> **Judgement call — move-in cost is counted once.** The implementation plan lists move-in
> cost as its own line in `committed`, but move-in cost is _already_ inside "required bills"
> as the synthetic `::movein` item. Adding it again double-counts it and overstates exposure
> by the full move cost. `computeMetrics` therefore filters items whose id ends in `::movein`
> out of the required-bills sum before adding `atlantaMoveTarget`. Net effect: the move is
> counted exactly once.

**Trip affordability** — only goals that actually have `trip_payment` items attached are
reported, with whether the payments get there in time and by how much they miss.

---

## 7. Scenarios

A scenario is a set of **override patches** on top of the one baseline plan — never a copy of
it. `resolvePlan(plan, settings, overrides)` returns brand-new objects and is proven by test
to leave the base plan byte-identical, so two scenarios open at once can't see each other.

- A **partial patch** merges over the entity, keeping every field you didn't touch. Ids can't
  be patched.
- A **`null` patch** removes the entity in that scenario.
- **Additions** append; an addition with a colliding id replaces rather than duplicating.
- The **baseline** scenario has empty overrides and resolves to a deep-equal plan.

---

## 8. What the engine deliberately does not do

- No interest, growth, or investment returns. Balances only move because of items you entered.
- No inflation.
- No taxes.
- No day-level timing within a month.
- No network access, and no clock — the same input always produces the same output.

---

## 9. Where to look in the code

| Concern | File |
| --- | --- |
| Cents type and arithmetic | `src/types/money.ts` |
| Month ordinals | `src/engine/months.ts` |
| Liquidity buckets | `src/engine/balances.ts` |
| Item expansion and ordering | `src/engine/items.ts` |
| Goal math | `src/engine/goals.ts` |
| The seven rules | `src/engine/shortfalls.ts` |
| Scenario resolution | `src/engine/scenario.ts` |
| Metrics | `src/engine/metrics.ts` |
| The month loop | `src/engine/index.ts` |
| Tests (178 of them) | `src/engine/__tests__/` |
