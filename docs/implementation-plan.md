# Next Chapter — MVP Implementation Plan

**Companion to:** `next-chapter-budget-planner-product-brief.md`
**Status:** Ready to build
**Author's note:** This plan is written to be executed by Perplexity Computer with minimal human intervention. Every file path, type name, formula, and acceptance check is specified so implementation does not require re-deciding anything.

---

## 0. Decisions locked before implementation

These were confirmed by the user and override any ambiguity in the product brief.

| Decision | Locked answer |
|---|---|
| Storage | **Browser-first now, database later.** All data in `localStorage` behind a swappable storage adapter interface. No backend, no auth, no server in the MVP. |
| Users | **Single user.** No accounts, no login, no ownership checks, no multi-tenant schema. |
| Build priority order | 1. Forecast engine → 2. Scenario compare → 3. Goals → 4. Dashboard polish. If time or budget runs out, cut from the bottom. |
| Code delivery | Source pushed to a **private GitHub repo** so it can be cloned and opened in VS Code. No manual copy-paste of code. |
| Hosting | Deployed as a **static site** to a private preview URL after every meaningful change. Static site = no server to keep running, so "background" availability is free. |
| Planning horizon | 18 months, default start = first day of the current month, user-editable. |
| Forecast granularity | Monthly. One-time items keep an optional exact `dueDate` field that is stored but not yet used in math. |

### Consequences of "browser-first, single-user"

Sections 12 (Security and privacy baseline) and Stretch goal 6 (Account linking) of the brief are **largely deferred**, because there is no server, no credentials, and no second user. What survives into the MVP:

- No bank credentials, account numbers, card numbers, or SSNs are ever collected — the input forms simply do not have those fields.
- Data never leaves the browser. No analytics, no telemetry, no third-party scripts, no external network calls at runtime.
- Export all data to JSON, import from JSON, and a hard "delete everything" button.
- All forecast math is covered by automated tests (this is the one security-success criterion that still fully applies).

Everything else in section 12 becomes part of the **DB migration phase**, documented but not built.

---

## 1. Technology stack

| Layer | Choice | Why this and not something else |
|---|---|---|
| Language | TypeScript (strict mode) | Money math with untyped objects is how you get silent bugs. Strict mode is non-negotiable. |
| Build tool | Vite | Fast, zero-config, produces a plain static `dist/` folder that deploys anywhere. |
| UI framework | React 18 | Largest ecosystem, best fit for the user's existing JS/mobile background. |
| Routing | React Router (hash-free, browser history) | Six screens need real URLs. |
| Styling | Tailwind CSS | No separate CSS files to maintain, consistent spacing/typography by default. |
| State | Zustand | ~1KB, no boilerplate, no providers. Redux is overkill for single-user local data. |
| Charts | Recharts | React-native API, good enough for line/bar/stacked area. |
| Validation | Zod | Same schemas validate user input AND validate imported JSON files. |
| Dates | `date-fns` | Month arithmetic without timezone landmines. |
| Money | Integer cents (`number`), never floats | See §4.1. |
| IDs | `crypto.randomUUID()` | Built into the browser, no dependency. |
| Tests | Vitest | Same config as Vite, near-zero setup. |
| Formatting/lint | Prettier + ESLint + `typescript-eslint` | Run in CI so the repo does not rot. |
| CI | GitHub Actions | Typecheck + lint + test on every push. |

**Explicitly rejected for the MVP:** Next.js (needs a server for no benefit here), Prisma/Postgres/Supabase (deferred to phase D), any auth provider (no users), any AI/LLM call at runtime (stretch goal 4 only), IndexedDB (localStorage is sufficient for this data volume — see §3.6).

---

## 2. System architecture

```
┌──────────────────────────────────────────────────────────┐
│                    React UI (src/ui)                     │
│   6 screens · dumb components · reads from store only    │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│              Zustand store (src/store)                   │
│   holds Plan + Scenarios + active selection              │
│   calls engine on every mutation, memoizes results       │
└──────────┬──────────────────────────────┬────────────────┘
           │                              │
┌──────────▼───────────────┐  ┌───────────▼────────────────┐
│  Forecast engine         │  │  Storage adapter           │
│  (src/engine)            │  │  (src/storage)             │
│  PURE FUNCTIONS ONLY     │  │  interface StorageAdapter  │
│  no React, no browser    │  │  ├─ LocalStorageAdapter ✅ │
│  APIs, no I/O, no Date() │  │  └─ ApiAdapter (phase D)   │
└──────────────────────────┘  └────────────────────────────┘
```

**The single most important architectural rule:** `src/engine` imports nothing from `src/ui`, `src/store`, or `src/storage`. It is a pure function library: `forecast(input) => output`. It never reads `Date.now()`, never touches `localStorage`, never throws on bad input (it returns typed errors). This is what makes the math testable and what makes the future backend migration trivial — the engine can be lifted into a Node server unchanged.

**The second rule:** the UI never computes money. If a number appears on screen, the engine produced it. No `balance - expense` in a JSX file, ever.

### Directory layout

```
next-chapter/
├─ .github/workflows/ci.yml
├─ index.html
├─ package.json
├─ tsconfig.json                 # strict: true, noUncheckedIndexedAccess: true
├─ vite.config.ts
├─ tailwind.config.js
├─ README.md                     # setup, architecture, how to run tests
├─ docs/
│  ├─ product-brief.md           # copy of the original brief
│  ├─ implementation-plan.md     # copy of this file
│  ├─ calculations.md            # every formula, in plain language
│  └─ db-migration.md            # phase D notes, written during phase A
└─ src/
   ├─ main.tsx
   ├─ App.tsx                    # router + layout shell
   ├─ types/
   │  ├─ money.ts                # Cents branded type + helpers
   │  ├─ plan.ts                 # Account, Goal, PlanItem, Housing, Settings
   │  ├─ scenario.ts             # Scenario, ScenarioOverrides
   │  └─ forecast.ts             # MonthResult, ForecastResult, Shortfall
   ├─ engine/
   │  ├─ index.ts                # runForecast() — the only public export
   │  ├─ months.ts               # month key generation + arithmetic
   │  ├─ balances.ts             # liquidity buckets, planning funds
   │  ├─ items.ts                # expands recurring items into months
   │  ├─ goals.ts                # reservations, gaps, required contribution
   │  ├─ shortfalls.ts           # the 7 shortfall rules
   │  ├─ metrics.ts              # runway, lowest balances, allocation
   │  ├─ scenario.ts             # applies overrides to a base plan
   │  └─ __tests__/              # one test file per module
   ├─ store/
   │  ├─ usePlanStore.ts
   │  └─ seed.ts                 # Lauren's starter data (§7)
   ├─ storage/
   │  ├─ StorageAdapter.ts       # the interface
   │  ├─ LocalStorageAdapter.ts
   │  ├─ migrations.ts           # schemaVersion upgrade chain
   │  └─ portability.ts          # export/import JSON
   └─ ui/
      ├─ components/             # Money, StatCard, ProgressBar, Warning, etc.
      ├─ screens/
      │  ├─ Onboarding.tsx
      │  ├─ Dashboard.tsx
      │  ├─ Timeline.tsx
      │  ├─ Goals.tsx
      │  ├─ Scenarios.tsx
      │  └─ Shortfalls.tsx
      └─ format.ts               # cents → "$1,234.56"
```

---

## 3. Data model

All of this lives in a single JSON document in `localStorage` under the key `next-chapter:v1`.

### 3.1 Root document

```ts
type AppData = {
  schemaVersion: number;        // 1 — bump on breaking shape changes
  createdAt: string;            // ISO
  updatedAt: string;            // ISO
  plan: Plan;                   // the confirmed "real world" baseline
  scenarios: Scenario[];        // always contains at least the baseline scenario
  activeScenarioId: string;
  settings: Settings;
};
```

### 3.2 Plan — the confirmed present

```ts
type Plan = {
  accounts: Account[];
  goals: Goal[];
  items: PlanItem[];            // recurring + one-time income and expenses
  housing: HousingAssumption[]; // current lease + future housing
};

type AccountType = 'checking' | 'savings' | 'high_yield' | 'invested' | 'credit_card';

type Account = {
  id: string;
  name: string;                 // "Chase Checking"
  type: AccountType;
  balance: Cents;               // for credit_card this is the amount OWED (positive)
  transferDelayDays?: 1 | 2 | 3;      // high_yield only
  scenarioAvailableAmount?: Cents;    // invested only; default 0 = not available
  notes?: string;
};
```

Liquidity behavior is **derived from `type`**, never stored — this prevents an account from drifting out of sync with its own rules.

| type | counts in totalAssets | fully liquid | near-liquid | volatile | in planningFunds |
|---|---|---|---|---|---|
| `checking` | yes | yes | — | — | always |
| `savings` | yes | yes | — | — | always |
| `high_yield` | yes | — | yes | — | always (default per brief §5) |
| `invested` | yes | — | — | yes | only up to `scenarioAvailableAmount` |
| `credit_card` | no (it's debt) | — | — | — | never |

```ts
type GoalPriority = 'essential' | 'important' | 'optional';
type GoalFlexibility = 'fixed' | 'adjustable' | 'deferrable' | 'cancellable';

type Goal = {
  id: string;
  name: string;
  priority: GoalPriority;
  flexibility: GoalFlexibility;
  targetAmount: Cents;
  targetMonth: string;                 // "2027-08" — month precision, per brief
  reservedAmount: Cents;               // already set aside today
  preferredAccountId?: string;
  monthlyContribution?: Cents;         // if omitted, engine uses required contribution
  active: boolean;                     // false = deferred/cancelled, excluded from math
  notes?: string;
};
```

```ts
type ItemKind = 'income' | 'recurring_expense' | 'one_time_expense'
              | 'trip_payment' | 'goal_contribution' | 'transfer';

type PlanItem = {
  id: string;
  kind: ItemKind;
  label: string;
  amount: Cents;                       // always positive; kind determines sign
  required: boolean;                   // required vs discretionary
  startMonth: string;                  // "2026-09"
  endMonth?: string;                   // omitted = runs to end of horizon
  everyNMonths?: number;               // default 1
  dueDate?: string;                    // ISO date, STORED ONLY (brief §6C)
  accountId?: string;                  // where it hits
  toAccountId?: string;                // transfers only
  goalId?: string;                      // goal_contribution / trip_payment
  confidence?: 'confirmed' | 'likely' | 'uncertain';  // income only
};
```

```ts
type HousingAssumption = {
  id: string;
  label: string;                       // "Current lease" / "Atlanta apartment"
  monthlyRent: Cents;
  utilitiesIncluded: boolean;
  monthlyUtilitiesEstimate?: Cents;    // used only when utilitiesIncluded = false
  startMonth: string;
  endMonth?: string;
  moveInCosts?: {
    securityDeposit: Cents;
    firstMonthRent: Cents;
    applicationFees: Cents;
    utilitySetup: Cents;
    movingTransport: Cents;
    furnitureHousehold: Cents;
    contingency: Cents;
  };
};
```

Move-in costs land as a single one-time outflow in `startMonth`. `Atlanta move target` (brief §8) is the sum of those seven fields.

### 3.3 Settings

```ts
type Settings = {
  horizonMonths: number;               // 18
  startMonth: string;                  // "2026-09"
  checkingFloor: Cents;
  emergencyTarget: Cents;
  emergencyTargetMode: 'fixed' | 'months_of_essentials';
  emergencyTargetMonths?: number;      // used when mode = months_of_essentials
  goalsMayReserveInvested: boolean;    // default FALSE — see §7 note
  currency: 'USD';
};
```

### 3.4 Scenario model

The brief calls for scenario duplication. Two options were considered:

- **Full snapshot** (deep copy of the whole plan per scenario) — dead simple, but edits to real balances have to be copied into every scenario by hand.
- **Base + override patch** — one source of truth for confirmed balances, scenarios only store differences.

**Chosen: base + override patch.** This directly satisfies brief §6D ("All scenarios begin from the same current confirmed balances, but future assumptions can differ"). It costs maybe 60 extra lines in `engine/scenario.ts` and saves constant re-syncing pain.

```ts
type Scenario = {
  id: string;
  name: string;
  description?: string;
  isBaseline: boolean;                 // exactly one scenario has true
  createdAt: string;
  overrides: ScenarioOverrides;
};

type ScenarioOverrides = {
  settings?: Partial<Settings>;
  accountAvailability?: Record<string, Cents>;   // accountId → invested amount unlocked
  transferDelayDays?: Record<string, 1 | 2 | 3>; // accountId → delay
  itemPatches?: Record<string, Partial<PlanItem> | null>;   // null = remove item
  addedItems?: PlanItem[];
  goalPatches?: Record<string, Partial<Goal> | null>;
  addedGoals?: Goal[];
  housingPatches?: Record<string, Partial<HousingAssumption> | null>;
  addedHousing?: HousingAssumption[];
};
```

`engine/scenario.ts` exports one function:

```ts
resolvePlan(plan: Plan, settings: Settings, overrides: ScenarioOverrides)
  => { plan: Plan; settings: Settings }
```

It applies patches, drops nulls, appends additions, and returns a plain resolved plan. The forecast engine only ever sees resolved plans — it has no idea scenarios exist. The baseline scenario has empty overrides.

### 3.5 Forecast output

```ts
type MonthResult = {
  month: string;                       // "2026-09"
  openingPlanningFunds: Cents;
  openingBillPayFunds: Cents;
  income: Cents;
  requiredOutflows: Cents;
  discretionaryOutflows: Cents;
  goalContributions: Cents;
  netTransfers: Cents;
  endingPlanningFunds: Cents;
  endingByAccount: Record<string, Cents>;
  endingFullyLiquid: Cents;
  endingNearLiquid: Cents;
  endingInvested: Cents;
  goalProgress: { goalId: string; reserved: Cents; target: Cents; gap: Cents }[];
  shortfalls: Shortfall[];
  lineItems: { itemId: string; label: string; amount: Cents; kind: ItemKind }[];
};

type ForecastResult = {
  months: MonthResult[];
  metrics: {
    totalAssets: Cents; fullyLiquid: Cents; nearLiquid: Cents; invested: Cents;
    netWorth: Cents; planningFunds: Cents; immediateBillPayFunds: Cents;
    protectedFunds: Cents; flexibleFunds: Cents;
    lowestCheckingBalance: { month: string; amount: Cents };
    lowestBillPayBalance: { month: string; amount: Cents };
    lowestPlanningFunds: { month: string; amount: Cents };
    runwayMonthsConservative: number;   // cash + near-cash only
    runwayMonthsExpanded: number;       // + user-approved invested funds
    potentiallyExposedAmount: Cents;
    moveReady: { targetMonth: string; ready: boolean; gap: Cents } | null;
    tripAffordability: { goalId: string; name: string; affordable: boolean; gap: Cents }[];
  };
  shortfalls: Shortfall[];             // flattened, chronological
};

type Shortfall = {
  id: string;
  month: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'cash' | 'timing' | 'goal_funding' | 'volatility' | 'credit';
  amount: Cents;
  title: string;                       // "Checking falls below floor"
  cause: string;                       // plain-English assumption that caused it
  affectedGoalIds: string[];
  affectedAccountIds: string[];
  suggestedLevers: string[];           // from brief §6E — display only, never auto-applied
};
```

### 3.6 Why localStorage is enough

Worst realistic case: 18 months × ~30 line items + 8 scenarios of overrides + 12 goals + 5 accounts ≈ well under 200 KB of JSON. The localStorage quota is 5 MB. Forecast results are recomputed in memory, never persisted. No IndexedDB needed.

`migrations.ts` reads `schemaVersion` on load and runs an ordered chain of upgrade functions. Version 1 ships with an empty chain — the machinery exists so a later shape change never bricks saved data.

---

## 4. Forecast engine specification

`runForecast(resolvedPlan, resolvedSettings) => ForecastResult`

### 4.1 Money rule

All amounts are **integer cents**, typed as `type Cents = number & { readonly __brand: 'Cents' }`. Never floats. `src/types/money.ts` exports `cents(n)`, `dollarsToCents(s)`, `centsToDollars(c)`, `addCents`, `subCents`, and `mulCentsByRate(c, rate)` which uses `Math.round`. Any division rounds **against the user** (round contributions up, round available funds down) so the app never optimistically over-reports available money.

### 4.2 Algorithm

1. Build the month key list from `startMonth` for `horizonMonths` (`engine/months.ts`).
2. Seed opening balances from `Account.balance` per account.
3. Expand `PlanItem[]` and `HousingAssumption[]` into a `Map<monthKey, ResolvedItem[]>` (`engine/items.ts`). Housing produces a recurring rent item, an optional utilities item when `utilitiesIncluded === false`, and a one-time move-in cost item in `startMonth`.
4. For each month, in order:
   a. Record opening planning funds and opening bill-pay funds.
   b. Apply income to `checking` (or the item's `accountId`).
   c. Apply required outflows, then discretionary outflows, then trip payments.
   d. Apply transfers (move between accounts, **never** counted as spending).
   e. Apply goal contributions: reduce the source account and increase that goal's `reservedAmount`. Contributions are capped so a goal never exceeds its target.
   f. If an account would go negative, drain in this fixed order: `checking` → `savings` → `high_yield` → `invested` (only up to the scenario-approved amount). If still short, allow negative planning funds and emit a shortfall. **Never silently sell more invested funds than approved.**
   g. Recompute ending buckets, run `shortfalls.ts`, snapshot the month.
5. After the loop, compute `metrics` (`engine/metrics.ts`).

Step (f) is the one place the engine "moves money" on the user's behalf. It is deliberate, deterministic, ordered, and every draw from `invested` emits a volatility shortfall — satisfying brief principle 8 (shortfalls are visible) without letting the forecast produce nonsense negative-checking cascades.

### 4.3 Formulas — exact

```
totalAssets        = Σ(balance) for checking, savings, high_yield, invested
fullyLiquid        = Σ(checking) + Σ(savings)
nearLiquid         = Σ(high_yield)
invested           = Σ(invested)
netWorth           = totalAssets − Σ(credit_card balances)
planningFunds      = fullyLiquid + nearLiquid + Σ(scenarioAvailableAmount of invested)

immediateBillPayFunds =
    Σ(checking)
  + Σ(savings)                         // same-day transfer assumed
  + Σ(high_yield where transferDelayDays ≤ 3)   // MVP month-level flag, see note

protectedFunds     = Σ(reservedAmount of active goals with priority = essential)
                   + required outflows of the current month
flexibleFunds      = max(0, planningFunds − protectedFunds)

goalFundingGap     = max(0, targetAmount − reservedAmount)
monthsRemaining    = months between current month and targetMonth
requiredMonthlyContribution =
    monthsRemaining <= 0
      ? goalFundingGap                 // whole gap shown as shortfall, no div-by-zero
      : ceil(goalFundingGap / monthsRemaining)

essentialMonthlyOutflow = mean of required outflows across the next 3 months
runwayMonthsConservative = (fullyLiquid + nearLiquid) / essentialMonthlyOutflow
runwayMonthsExpanded     = planningFunds / essentialMonthlyOutflow

atlantaMoveTarget = securityDeposit + firstMonthRent + applicationFees
                  + utilitySetup + movingTransport + furnitureHousehold + contingency

nearTermCommittedGoals = required bills through horizon date
                       + emergencyTarget
                       + atlantaMoveTarget
                       + Σ(targets of active goals due within horizon)
potentiallyExposedAmount = max(0, nearTermCommittedGoals − fullyLiquid − nearLiquid)
```

**MVP note on `immediateBillPayFunds`:** with a monthly model there is no bill due date to compare against, so all high-yield funds count. The rule is implemented as an isolated, documented function so day-level checks drop in later without touching the rest of the engine.

### 4.4 The seven shortfall rules (brief §8)

Implemented one function per rule in `engine/shortfalls.ts`. Each returns `Shortfall[]` for a given month:

| # | Rule | severity | category |
|---|---|---|---|
| 1 | Projected checking < `checkingFloor` | critical | cash |
| 2 | Immediate bill-pay funds < required bills for the month | critical | timing |
| 3 | Projected planning funds < 0 | critical | cash |
| 4 | An `essential` goal is underfunded at its `targetMonth` | critical | goal_funding |
| 5 | An `important`/`optional` goal is underfunded at its `targetMonth` | warning | goal_funding |
| 6 | Month draws on `invested` funds for a required outflow, move cost, or essential goal | warning | volatility |
| 7 | Forecast credit-card payment > immediate bill-pay funds | critical | credit |

Rule 6 is where the brief's example warning text comes from. Each shortfall's `cause` string names the specific assumption (item label, goal name, or scenario override) that produced it, and `suggestedLevers` is populated from the brief §6E list — **displayed only, never auto-applied**.

---

## 5. Screens

Built in priority order. Every screen reads from the store; none of them do arithmetic.

| # | Screen | Route | Contents |
|---|---|---|---|
| 1 | Onboarding | `/setup` | Accounts (with liquidity labels + transfer-delay picker + invested-availability field), current lease through 2027-07 with utilities-included checkbox, recurring non-rent bills, income (defaults to $0), checking floor, emergency target, horizon. Progressive: 5 short steps, skippable, resumable. Pre-filled with seed data (§7). |
| 2 | Timeline | `/timeline` | 18 month cards. Each shows opening/ending planning funds, ending checking / near-liquid / invested, inflows, required vs discretionary outflows, goal contributions, and an at-risk badge. Cards expand to edit that month's items inline. |
| 3 | Shortfalls | `/shortfalls` | Chronological list. Each row: month, severity chip, category chip, amount, cause sentence, affected goals/accounts, and the lever list. Filterable by severity and category. |
| 4 | Scenarios | `/scenarios` | Scenario list, create/duplicate/rename/delete, an assumption editor form, and a side-by-side comparison table (baseline vs selected) across every metric in `ForecastResult.metrics` with deltas highlighted. |
| 5 | Goals | `/goals` | Sorted by priority then deadline. Progress bar, reserved vs target, gap, required monthly contribution, preferred account, flexibility, active toggle. |
| 6 | Dashboard | `/` | All nine balance concepts as stat cards, active-scenario selector, lowest-balance callouts, both runway numbers with the volatility label, goal summary, an allocation bar (cash / near-cash / invested vs near-term commitments), and a shortfall banner. Stacked-area chart of projected balances by account type over 18 months. |

Shared components: `Money`, `StatCard`, `ProgressBar`, `SeverityChip`, `MonthCard`, `WarningBanner`, `LiquidityBadge`, `EditableAmountField` (dollars in, cents stored).

Design: light theme, one accent color, generous whitespace, tabular numerals for all money, red reserved exclusively for shortfalls. Fully responsive down to 375px so it is usable on a phone.

---

## 6. Test strategy

Vitest. The bar: **every formula in §4.3 and every rule in §4.4 has at least one test.** Target ≥90% line coverage in `src/engine`, and coverage is not enforced anywhere else.

Required test files:

- `months.test.ts` — horizon generation, year rollover, month diffing.
- `money.test.ts` — rounding direction, no float drift over 18 months of arithmetic.
- `balances.test.ts` — each of the nine balance concepts, credit cards excluded from assets, invested included only up to the approved amount.
- `items.test.ts` — recurring expansion, `endMonth` respected, `everyNMonths`, housing → rent/utilities/move-in items.
- `goals.test.ts` — gap, required contribution, **target month in the past does not divide by zero**, contributions capped at target, inactive goals excluded.
- `shortfalls.test.ts` — one test per rule, plus a case where several fire in the same month.
- `metrics.test.ts` — both runway variants, lowest-balance identification, exposed amount, move-ready.
- `scenario.test.ts` — patches apply, `null` removes, additions append, baseline overrides are a no-op, **overriding a scenario never mutates the base plan** (immutability assertion).
- `forecast.integration.test.ts` — the full seed plan (§7) across all 18 months with hand-checked expected numbers, plus each of the eight starter scenarios producing a stable snapshot.
- `portability.test.ts` — export → import round-trips to an identical document; a malformed file is rejected by Zod with a readable message and does not corrupt existing data.

---

## 7. Seed data

Ships in `src/store/seed.ts` and pre-fills onboarding. Every value is editable in the UI; these are placeholders where the brief's open questions were unanswered, and they are **clearly labeled "estimate — please confirm"** in the onboarding UI.

- **Accounts:** Checking, Standard savings, Fidelity high-yield cash (delay = 2 days), Fidelity Go (`scenarioAvailableAmount` = $0), Apple Card. Balances start at $0 for the user to fill in.
- **Housing:** "Current lease" — rent through `2027-07`, `utilitiesIncluded: true`. "Atlanta apartment" — starts `2027-08` (**assumption**, from open question 1: the month immediately after the lease ends), with the seven move-in cost fields present and zeroed.
- **Settings:** `checkingFloor` = $1,000 (**assumption**, open question 2), `emergencyTargetMode` = `months_of_essentials` with 3 months (**assumption**, open question 3), `goalsMayReserveInvested` = **false** (open question 4 — the conservative default; a toggle in settings flips it and triggers a rule-6 warning whenever used).
- **Goals:** the eleven starter goals from brief §6B, all with `targetAmount: 0` and sensible target months (NYC trips spread across the horizon, Michigan, cruise, Atlanta move at `2027-08`, emergency reserve at `2027-05`).
- **Scenarios:** all eight from brief §6D, created as override patches on the baseline.

Open questions 5, 6, and 7 from the brief are resolved by the locked decisions in §0 (single-user; the demo priority is the forecast engine and scenario simulator; the allocation outputs shipped are `potentiallyExposedAmount` plus the cash-vs-invested allocation bar and scenario comparison).

---

## 8. Build phases

Each phase ends in a working, deployed, test-passing app. No phase leaves the repo broken.

### Phase 0 — Repo and skeleton
Scaffold Vite + React + TS + Tailwind + Vitest + ESLint/Prettier. Create the private GitHub repo, push, wire the CI workflow. Copy the brief and this plan into `docs/`. Deploy the empty shell to confirm the pipeline works end to end.
**Done when:** repo clones and runs with `npm install && npm run dev`; CI is green; a preview URL loads.

### Phase 1 — Types and forecast engine (highest priority)
All of `src/types` and `src/engine`, written test-first. No UI at all in this phase.
**Done when:** every test in §6 passes; `forecast.integration.test.ts` produces hand-verified numbers for all 18 months.

### Phase 2 — Storage, store, and onboarding
`StorageAdapter` + `LocalStorageAdapter` + migrations + export/import + Zustand store + the onboarding screen + seed data.
**Done when:** real balances can be entered, they survive a page refresh, and export/import round-trips cleanly.

### Phase 3 — Timeline and shortfalls
The two screens that expose the engine's output. Month cards with inline editing; the chronological shortfall list.
**Done when:** editing a month's items visibly changes downstream months and the shortfall list within one render.

### Phase 4 — Scenarios and comparison
Scenario CRUD, the assumption editor, the eight starter scenarios, and the side-by-side comparison table.
**Done when:** at least three scenarios can be compared and the baseline plan is provably unmodified by scenario edits.

### Phase 5 — Goals
The goals screen with progress, gaps, required contributions, and reservation editing.
**Done when:** every field in the `Goal` type is editable and reservations are reflected in `protectedFunds`.

### Phase 6 — Dashboard and polish
Stat cards, allocation bar, the projected-balance chart, responsive pass, empty states, the `docs/calculations.md` explainer, `README`, and a final accessibility/contrast check.
**Done when:** all 13 success criteria in brief §13 are demonstrably met.

### Phase D (deferred) — Database migration
Not built now. `docs/db-migration.md` is written during Phase 2 and specifies: implement `ApiAdapter` against the same `StorageAdapter` interface; lift `src/engine` unchanged into a Node/Express or Next route handler; Postgres tables mirroring §3 one-to-one with a `user_id` foreign key on every row; a managed auth provider; and then the full brief §12 security checklist becomes in scope.

Because storage sits behind an interface and the engine is pure, this migration touches `src/storage` and adds a server — it does not rewrite the app.

*(Effort is expressed as phases rather than credit amounts; phases 0–3 are the core and phases 4–6 are the remainder, and the priority order in §0 governs what gets cut if the budget tightens.)*

---

## 9. How this runs without you copying code

1. **GitHub connector** — you authorize GitHub once, I create a private repo and push every phase as its own commit with a real message. You open it in VS Code with `git clone` (or the GitHub extension) and pull as phases land. No copy-paste.
2. **Deployed preview** — after each phase I deploy the static build to a private URL only you can reach. Since there is no backend, the site keeps working whether or not this sandbox is alive.
3. **Local dev** — `npm install && npm run dev` in VS Code. That is the entire setup; there is no database to install, no `.env` file, and no API keys.
4. **Background execution** — I can run the phases back to back in one go and report at the end, or check in with you after each phase. Say which you prefer; the default is to run phases 0–3 straight through and then check in, since that is the point where the app first becomes genuinely useful.

---

## 10. Risks and how they are handled

| Risk | Mitigation |
|---|---|
| Float rounding corrupts money over 18 months | Integer cents everywhere, enforced by a branded type; a dedicated drift test. |
| Scenario overrides silently mutate the base plan | `resolvePlan` is pure and returns new objects; an immutability assertion test guards it. |
| A goal's target date in the past divides by zero | Explicit guard in `goals.ts` plus a dedicated test (called out in the brief). |
| localStorage cleared by the browser wipes everything | Export-to-JSON is built in Phase 2, and the UI nudges an export after any large edit. |
| Engine and UI drift apart as features grow | The rule that the UI never computes money; all displayed values trace to `ForecastResult`. |
| Scope creep from the stretch roadmap | Stretch goals 1–6 are not touched. Only the `dueDate` field is stored forward-compatibly. |
| The plan becomes too big to fix | Six phases, each independently shippable and deployed; the priority order in §0 says exactly what to cut. |
