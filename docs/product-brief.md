# Next Chapter Budget Planner

## Product brief — High-level planning document

**Working names:** Next Chapter, Runway, Future Budget

**Planning horizon:** 18 months by default

**Primary use case:** A private, forward-looking budgeting and cash-flow planning tool for a student moving from college into post-graduation life. The user has existing assets, currently limited or uncertain income, known current expenses, travel plans, and an expected Atlanta-area housing transition after graduation.

**Known timeline:** Expected graduation is May 2027. The current lease is locked through July 2027 and includes utilities. The expected Atlanta housing transition should be modeled around and after the July 2027 lease end.

---

## 1. Product vision

Build a privacy-first financial planning web app that helps users answer:

> Can I afford my current commitments, planned trips, and post-graduation move while keeping enough cash available for emergencies and uncertain income?

The app is not primarily a retrospective expense tracker. It is a **future scenario planner** that models cash flow, savings goals, and tradeoffs over the next 18 months.

The product should make uncertainty visible instead of hiding it. A user should be able to change assumptions—such as future rent, job start date, monthly income, trip cost, moving expenses, or allocation between cash and investments—and immediately see how those changes affect cash balances, goal completion, liquidity, and financial risk.

---

## 2. Core problem

Many budgeting tools assume that users have reliable monthly income and want to categorize past purchases. That is not the main problem this product solves.

This product is designed for a transition period in which:

- The user already has more than $20,000 across checking, savings, high-yield cash, and invested funds.
- The user is currently on a full scholarship and does not have dependable regular income.
- A part-time job may provide income next semester, but the base plan should not depend on it.
- Current rent and other known expenses need to be planned for.
- Current rent is locked through July 2027 and includes utilities.
- The user expects housing costs and lifestyle patterns to change after graduation in May 2027.
- The user may want to live in or near Atlanta after the current lease ends in July 2027.
- The user wants to plan several trips, including approximately three New York City trips, a Michigan trip, and a cruise.
- The user needs to preserve enough cash for an apartment move, emergency costs, and potentially delayed employment.
- The user wants visibility into whether too much money is allocated to volatile investments relative to near-term needs.

The app should answer not only "What did I spend?" but also:

- What is my lowest projected cash balance under this plan?
- How long does my liquid and near-liquid money last if income is delayed?
- Can I take this trip and still be ready to move into an Atlanta apartment?
- What changes if I get a part-time job next semester?
- What changes if my full-time job starts later than expected?
- Which goal becomes underfunded if I increase future rent or travel spending?
- How much of my total money is appropriate to hold in checking, near-liquid cash, goal reserves, and volatile investments given upcoming commitments?

---

## 3. Primary user and context

### Primary user

A college student approaching graduation who has meaningful savings/assets but uncertain income and upcoming life changes.

### Personal planning context

The product should support the following real-world planning needs:

- Current rent through July 2027, including utilities.
- Graduation in May 2027.
- A post-graduation move to the Atlanta area, likely after the July 2027 lease end.
- Possible part-time income next semester.
- Likely full-time employment within the next 18 months.
- Multiple travel goals with different target dates and priorities.
- A desire to keep an emergency reserve intact.
- Existing funds distributed across checking, savings, a high-yield Fidelity cash account, and Fidelity Go investments.
- A need to understand the liquidity tradeoff between cash held for near-term plans and money exposed to investment volatility.

### Product promise

> This is a planning tool, not a bank. It helps users organize their own balances, assumptions, future expenses, and goals without asking for bank passwords, full account numbers, card numbers, Social Security numbers, or brokerage credentials.

---

## 4. Product principles

1. **Forward-looking first** — The future timeline and scenario comparison matter more than historical spending analytics.
2. **User-controlled assumptions** — The app shows math and tradeoffs. It does not silently make financial decisions for the user.
3. **Conservative by default** — The baseline plan assumes $0 uncertain income until the user explicitly includes it.
4. **Goals before generic categories** — Move readiness, emergency cash, rent, and trips are more meaningful than generic budget percentages.
5. **Separate money location from money purpose** — An account is where money sits; a goal/bucket explains what that money is reserved for.
6. **Liquidity matters** — Total assets are not the same thing as money safely available for near-term spending.
7. **All balances are visible** — Checking, savings, high-yield cash, and Fidelity Go all appear in the financial picture, while availability and volatility are clearly labeled.
8. **Shortfalls are visible** — When cash is insufficient, show the gap and affected goals instead of automatically reallocating money.
9. **Privacy by design** — Start with manual inputs; defer live financial-account connection until the core product is useful and secure.

---

## 5. Account and liquidity model

The app should display all account types and include all user-approved balances in the overall plan, while calculating several different totals rather than presenting one misleading "available" balance.

| Account type | Example | Liquidity treatment | Purpose in the app |
|---|---|---|---|
| Checking | Daily spending / bill-pay account | Fully liquid | Covers immediate bills, card payments, rent, and normal spending |
| Standard savings | Traditional savings account | Liquid | Emergency reserves, goals, and transfers to checking |
| High-yield Fidelity cash account | Fidelity high-yield savings/cash account | Near-liquid | Counts in planning cash by default; reflects a user-selected transfer delay of 1–3 business days before checking access |
| Fidelity Go | Automated investment account | Invested / volatility-aware | Included in total assets and in the overall plan. It can be made available to satisfy a plan, but the UI must distinguish it from immediate cash and flag when a forecast relies on selling or transferring invested funds |
| Credit card | Apple Card or other card | Liability | Tracks statement balance, due date, and expected payment; not treated as income or available cash |

### Required balance concepts

| Metric | Definition |
|---|---|
| Total assets | Checking + savings + high-yield account + Fidelity Go/investments |
| Fully liquid cash | Checking + standard savings |
| Near-liquid cash | High-yield Fidelity cash account, adjusted for its expected transfer delay |
| Volatile/invested funds | Fidelity Go and other market-exposed funds; visible in the full plan but labeled separately from cash |
| Planning funds | All balances the user has elected to include in the active scenario, including invested funds if selected |
| Immediate bill-pay funds | Checking plus funds that can arrive before the relevant bill due date |
| Protected cash | Money assigned to essential bills, emergency reserve, move costs, or other committed goals |
| Flexible funds | Planning funds minus protected money and near-term required expenses |
| Net worth | Total assets minus credit-card and other debt balances |

### Default treatment rules

- All accounts appear on the dashboard and contribute to total assets/net worth.
- Checking and standard savings are fully liquid.
- The high-yield Fidelity account counts toward planning funds by default but is labeled **near-liquid** with a user-selected transfer-time assumption of 1, 2, or 3 business days.
- Fidelity Go is included in total assets and may be included in the active scenario's total planning funds, but it is clearly labeled as invested and potentially volatile rather than equivalent to cash.
- The app distinguishes between total planning funds and immediate bill-pay funds so a plan cannot silently rely on an untimely investment sale or delayed transfer.
- When a scenario depends on Fidelity Go for a required bill, move expense, emergency, or near-term goal, show an explicit volatility/liquidity warning.
- The user can choose whether a specific amount of Fidelity Go is available to a scenario, but that decision is explicit and recorded in the scenario assumptions.
- The future account-allocation feature should help the user evaluate how much should remain in checking, near-liquid cash, protected goals, and volatile investments given goal timing and risk tolerance. It should display transparent allocation guidance and scenario impact, not automated financial advice or transfers.

---

## 6. Core MVP

The MVP consists of five product areas.

### A. Onboarding and financial snapshot

The user enters:

- Current balances for checking, standard savings, high-yield Fidelity cash, Fidelity Go, and credit cards.
- Current rent amount and confirmed end date: July 2027.
- Confirmation that current rent includes utilities.
- Known recurring expenses outside of rent.
- Current dependable income, which can correctly be $0.
- Minimum checking-floor amount.
- Emergency-fund target.
- Default 18-month planning start date and horizon.

### B. Goals and sinking funds

Users create goals with a target amount, target date, priority, funding status, and purpose. Goals reserve portions of the user’s balances rather than existing only as labels.

Starter goal types:

- Emergency reserve.
- Current rent / near-term required bills.
- Atlanta move fund.
- New York City trip 1.
- New York City trip 2.
- New York City trip 3.
- Michigan trip.
- Cruise.
- Career transition fund.
- Transportation/scooter maintenance reserve.
- Long-term investing.

For the MVP, trips are represented as a **single target amount and one target date**. They do not need separate flight, lodging, food, or activity buckets yet.

Each goal should include:

- Goal name.
- Priority: essential, important, optional.
- Target amount.
- Target date.
- Amount already assigned/reserved.
- Preferred account location.
- Monthly contribution plan.
- Flexibility: fixed, adjustable, deferrable, or cancellable.
- Notes.

### C. Future timeline

Create an editable **monthly** timeline spanning 18 months. Monthly forecasting is the MVP calculation model.

For each month, the user can add or edit:

- Expected income.
- Recurring bills.
- Variable spending budget.
- One-time expenses.
- Trip payments.
- Goal contributions.
- Transfers between account types.
- Future rent and housing assumptions.
- Expected move-in costs.

Each month displays:

- Opening planning funds.
- Opening immediate bill-pay funds.
- Inflows.
- Required outflows.
- Optional/discretionary outflows.
- Goal contributions/reservations.
- Ending planning funds.
- Ending checking balance.
- Ending near-liquid balance.
- Ending invested/volatile funds.
- Goal progress.
- Alerts/warnings.

One-time expenses may store an **optional exact due date** even though the forecast rolls up results by month. This preserves a clean monthly MVP while enabling later calendar views and transfer-timing warnings.

### D. Scenario builder

A scenario is a copy of the financial plan with different assumptions. All scenarios begin from the same current confirmed balances, but future assumptions can differ.

Starter scenarios:

1. **Baseline: no dependable income** — Assume no future income until a selected full-time job start month.
2. **Part-time next semester** — Add conservative expected take-home income beginning next semester.
3. **Move-first** — Prioritize emergency reserve and Atlanta move fund before optional travel.
4. **Travel-heavy year** — Include NYC x3, Michigan, and cruise at estimated budgets.
5. **Lower-rent Atlanta housing** — Use roommates or a lower future rent target.
6. **Higher-rent Atlanta housing** — Use a solo apartment/higher rent plus larger move-in costs.
7. **Delayed employment** — Push full-time income farther into the future.
8. **Cash-heavy versus investment-heavy** — Compare a scenario that keeps more money near-liquid for upcoming commitments with one that maintains a larger volatile/invested allocation.

Scenario fields that can change:

- Income amount, frequency, start date, and confidence level.
- Current/future rent.
- Move-in month.
- Security deposit, first month, application fees, utilities, furniture, moving costs, and contingency.
- Travel costs, payment dates, and trip priority.
- Monthly variable spending budget.
- Emergency-fund target.
- Checking floor.
- Goal funding priorities.
- High-yield transfer-time assumption.
- Whether and how much invested Fidelity Go money is available to the scenario.
- Planned allocation between checking, savings, near-liquid high-yield cash, and invested/volatile funds.

### E. Results dashboard and warnings

The dashboard must expose tradeoffs and shortfalls rather than automatically deciding how to fix them.

Required outputs:

- Current total assets.
- Fully liquid cash, near-liquid cash, and invested/volatile fund totals.
- Planning funds and immediate bill-pay funds.
- Protected funds and flexible funds.
- Month-by-month projected balances.
- Lowest projected checking balance.
- Lowest projected immediate bill-pay balance.
- Lowest projected planning-funds balance.
- Cash runway under the active scenario.
- Goal funding status and funding gaps.
- Move-ready status by target date.
- Trip affordability by deadline.
- A clear list of shortfalls and the assumptions causing them.
- An allocation view showing how much money is in cash/near-cash versus market-exposed investments and whether that allocation conflicts with near-term committed goals.

Example warning:

> Under the "Travel-heavy year" scenario, the Atlanta move fund is projected to be $1,100 below its target by August. The lowest projected planning-funds balance occurs in July. This scenario requires a transfer from the high-yield account before rent is due and relies on $600 of Fidelity Go funds for a near-term obligation.

The app should show options, not make automatic changes:

- Increase income assumption.
- Lower an expense budget.
- Reduce a trip cost.
- Delay or defer an optional goal.
- Change future housing assumptions.
- Adjust the target date.
- Explicitly use near-liquid or invested funds.
- Change target allocation between cash and investments.

---

## 7. Key user flows

### Flow 1: First-time setup

1. Create an account.
2. Enter balances by account type.
3. Add checking, standard savings, high-yield Fidelity cash, Fidelity Go, and credit card balances.
4. Choose a 1–3 business-day transfer-time assumption for the high-yield account.
5. Confirm Fidelity Go is market-exposed and indicate how much, if any, can be included in a scenario for near-term needs.
6. Set current rent through July 2027, note that utilities are included, add recurring non-rent bills, set a checking floor, and set an emergency target.
7. Create initial goals for an Atlanta move and planned trips.
8. Review a baseline 18-month forecast with $0 uncertain income.

### Flow 2: Create a scenario

1. Duplicate the baseline plan.
2. Name the new scenario, such as "Part-time next semester" or "Travel-heavy year."
3. Change only the relevant assumptions.
4. Recalculate the forecast immediately.
5. Review summary metrics, account allocation, and shortfall warnings.
6. Compare the scenario against baseline.

### Flow 3: Evaluate a decision

1. Open an existing scenario.
2. Add a possible expense, such as a NYC trip or higher Atlanta rent.
3. View changes in lowest cash balance, goal funding, account allocation, and move-ready date.
4. Identify affected essential/important/optional goals.
5. Decide whether to accept the plan, reduce the cost, change the date, change an allocation, or adjust another assumption.

### Flow 4: Update real life over time

1. Update account balances manually at the start/end of a month.
2. Mark planned expenses as actual or revise their expected amount.
3. Add new income if a part-time job begins.
4. Update future housing/job assumptions when better information becomes available.
5. Keep scenario history to compare what was planned with what actually changed.

---

## 8. Key calculations

All formulas should be transparent in the UI or help documentation. This is a planning tool, so explainable math matters more than opaque recommendations.

### Monthly forecast

```text
Ending planning funds =
  Opening planning funds
  + expected income
  - required recurring expenses
  - one-time expenses
  - planned trip payments
  - variable/discretionary spending
  - planned goal contributions
  - net transfers out of planning funds
```

The implementation should track balances by account type where practical, so transfers are not double-counted as spending.

### Immediate bill-pay funds

```text
Immediate bill-pay funds =
  checking balance
  + funds already in standard savings that can reach checking before a bill due date
  + high-yield funds only when their transfer delay permits arrival before the bill due date
```

For the MVP’s monthly forecast, the app can use a simplified month-level availability flag. Optional exact due dates can later enable stricter day-level transfer checks.

### Goal funding gap

```text
Goal funding gap = target amount - amount assigned/reserved
```

### Required monthly contribution

```text
Required monthly contribution =
  (goal target - current assigned balance)
  / months remaining until target date
```

If the target date has passed and the goal is not fully funded, the app should show the entire remaining amount as a shortfall rather than divide by zero.

### Flexible funds

```text
Flexible funds =
  planning funds
  - protected funds
  - near-term required expenses
```

### Runway

```text
Cash runway =
  planning funds available for obligations
  / estimated monthly essential outflows
```

Runway is an estimate. The dashboard should show both a conservative version based on fully liquid + near-liquid funds and an expanded version that includes user-approved invested funds, clearly labeled with a volatility warning.

### Move-ready target

```text
Atlanta move target =
  security deposit
  + first month rent
  + application/admin fees
  + utility setup
  + moving/transport
  + essential furniture/household setup
  + move contingency
```

### Allocation awareness

The app does not provide automatic investment advice. It should display scenario math such as:

```text
Near-term committed goals =
  required bills through selected date
  + emergency reserve target
  + move target
  + goals due within selected horizon

Potentially exposed amount =
  invested/volatile funds that would be needed to cover near-term committed goals
```

If potentially exposed amount is greater than $0, display an explanation such as:

> This scenario relies on market-exposed funds to cover commitments due within the selected planning period. Consider comparing a cash-heavy scenario with an investment-heavy scenario before making an allocation decision.

### Shortfall logic

A shortfall is created when any of the following occurs:

- Projected checking balance falls below the selected checking floor.
- Projected immediate bill-pay funds are insufficient for required bills.
- Projected planning funds are negative.
- An essential goal is underfunded at its deadline.
- A required bill cannot be paid without a high-yield transfer that would arrive after its due date.
- A scenario requires user-designated invested Fidelity Go funds for a required bill, move expense, emergency, or near-term goal.
- A credit-card payment is forecast to exceed available bill-pay funds.

The system should report the amount, date/month, affected goal/account, severity, and relevant assumption behind each shortfall.

---

## 9. MVP screens

### 1. Welcome / onboarding

- Explanation of privacy-first manual setup.
- Planning horizon selection: default 18 months.
- Account balance setup.
- Liquidity and volatility labels.
- Current housing/rent setup: rent through July 2027, utilities included.
- Checking-floor and emergency-target setup.

### 2. Dashboard

- Total assets.
- Fully liquid cash.
- Near-liquid cash.
- Invested/volatile funds.
- Planning funds.
- Immediate bill-pay funds.
- Protected funds.
- Flexible funds.
- Active scenario selector.
- Lowest projected balance.
- Cash runway.
- Goal summary.
- Account allocation summary.
- Shortfall/warning banner.

### 3. Timeline / plan view

- 18 monthly columns/cards.
- Inflows, outflows, transfers, and goals for each month.
- Projected ending balance for each account type.
- Clear at-risk month indicators.
- Optional due-date metadata for future calendar and transfer-timing features.

### 4. Goals view

- All goals sorted by priority and deadline.
- Progress bars.
- Required monthly contribution.
- Funding gaps.
- Assigned/reserved balance amounts.
- For the MVP, one total target per trip.
- Future option to expand a goal into cost components.

### 5. Scenario builder

- Scenario list.
- Create/duplicate/rename scenario.
- Edit assumptions.
- Set account availability/allocation assumptions.
- Compare baseline versus selected scenario.
- Side-by-side metric comparison.

### 6. Shortfalls / insights view

- A chronological list of forecast problems.
- The cause of each issue.
- Which goals/accounts are impacted.
- Whether the issue is a cash, timing, goal-funding, or investment-volatility issue.
- Potential levers the user may choose to change.

---

## 10. Explicitly out of scope for MVP

The following should be documented and deliberately deferred:

- Live bank-account aggregation.
- Bank credential collection of any kind.
- Automated transfers or payments.
- Investment trading or personalized investment recommendations.
- Fidelity Go synchronization.
- Apple Card import.
- Receipt upload/OCR.
- Automatic merchant categorization.
- Tax planning.
- Credit-score monitoring.
- Shared household budgets.
- Social features.
- AI-generated financial advice.
- Exact daily cash-flow calculations; the MVP forecasts by month while preserving optional due-date metadata.

---

## 11. Stretch roadmap

### Stretch goal 1: Apple Card CSV import

A user-controlled import workflow:

1. Export Apple Card transactions from the Wallet app.
2. Upload a CSV file.
3. Validate file type, size, expected headers, dates, and amounts.
4. Show a preview before saving anything.
5. Detect duplicate transactions.
6. Let the user confirm or edit category mapping.
7. Save normalized transactions and an import audit record.
8. Delete the original uploaded file after processing unless the user explicitly chooses retention.

### Stretch goal 2: Actual-versus-plan tracking

- Mark planned events as completed/actual.
- Compare actual spending to forecast amounts.
- Update future projected balances based on current balances.
- Show which assumptions were consistently too optimistic or conservative.

### Stretch goal 3: Smart planning helpers

- "Can I afford this?" sandbox for a new expense.
- Suggested monthly contribution to meet a goal deadline.
- Goal-priority conflict explanation.
- Scenario sensitivity view for rent, income timing, trip costs, and investment allocation.
- Calendar reminders for rent, payment deadlines, and trip deposits.
- Optional sub-buckets inside a trip or move goal, such as travel, lodging, food, activities, or deposit/furniture/moving costs.

### Stretch goal 4: Cost estimation assistance

- Optional AI-assisted trip-cost estimates based on user-selected destination, dates, trip length, and style.
- Suggested cost ranges, not guaranteed prices.
- A requirement to show sources/assumptions and allow full manual override.
- Optional move-cost estimate builder based on rent, location, household setup needs, and moving distance.

### Stretch goal 5: Apple Card and other file imports

- OFX/QFX/QBO support after CSV is reliable.
- Import mapping rules.
- Local categorization rules, such as "MARTA → Transportation."
- Duplicate and reconciliation tools.

### Stretch goal 6: Account linking

Only consider after the manual planning workflow, authorization model, data-deletion controls, and security review are complete.

Requirements:

- Use a provider-hosted connection flow.
- Never collect or store bank usernames/passwords.
- Request read-only access and the minimum scopes needed.
- Store tokens server-side only and encrypted at rest.
- Let the user disconnect accounts and delete imported data.
- Verify inbound webhooks.
- Clearly explain what data is accessed and retained.

---

## 12. Security and privacy baseline

Security is a product requirement even though live account linking is not part of the MVP.

### Data minimization

- Collect only balances, planning inputs, goals, future expenses, and optional manual transactions.
- Do not request bank credentials, full bank account numbers, card numbers, Social Security numbers, or brokerage credentials.
- Do not store raw uploaded files in the MVP because file import is deferred.
- Do not use financial data for advertising or sale.

### Authentication and authorization

- Use a mature managed authentication provider rather than building password/session infrastructure from scratch.
- Protect all authenticated routes.
- Enforce server-side ownership checks on every account, goal, scenario, transaction, and forecast record.
- Never trust a user ID supplied by the client.
- Use secure, HttpOnly, SameSite cookies or secure token handling supplied by the auth provider.

### Application security

- HTTPS only.
- Strict input validation for every API request.
- Parameterized database queries or an ORM.
- Rate limits on sign-in, password reset, data export, and write-heavy endpoints.
- CSRF protections if cookie-based authentication is used.
- Secure headers/content security policy where applicable.
- Secrets stored in environment variables or a managed secrets store, never in source control or frontend code.
- Dependency updates and vulnerability scanning.

### Privacy controls

- Export personal data.
- Permanently delete all user data.
- Explain what is stored and why.
- Avoid logging balances, transactions, account labels, access tokens, session IDs, or raw request bodies.
- Maintain an audit trail for sensitive actions such as export, deletion, major scenario changes, and future imports.

### Security success criteria

- One user cannot access, alter, or infer another user’s records.
- The product never handles bank login credentials.
- No sensitive values appear in application logs or analytics.
- Deleted accounts remove or anonymize related data according to a documented retention policy.
- All critical forecast calculations have automated tests.

---

## 13. Success criteria

The MVP is successful when the user can:

1. Enter real current balances across checking, savings, high-yield Fidelity cash, Fidelity Go, and credit card accounts.
2. See all money in total assets and distinguish fully liquid, near-liquid, and volatile/invested funds.
3. Include the high-yield Fidelity account in planning funds by default while accounting for a selected 1–3 business-day transfer delay.
4. Include Fidelity Go in total assets and optionally in scenario planning funds while receiving explicit volatility/liquidity warnings when it is needed for near-term commitments.
5. Create goals that reserve portions of balances for an Atlanta move, emergency fund, and multiple trips.
6. Enter known current and future expenses over an 18-month horizon.
7. Model current rent through July 2027, including utilities, and future housing costs after the lease ends.
8. Represent each MVP trip as a single target amount and deadline.
9. Compare at least three scenarios with different income, travel, housing, and allocation assumptions.
10. Identify the lowest-balance month and any goal funding gaps.
11. See explicit shortfalls rather than hidden automatic reallocations.
12. Use the results to decide whether a future trip, apartment option, spending assumption, or investment allocation is feasible.
13. Use the app without linking a bank or uploading any financial statement.

---

## 14. Resolved product decisions

| Decision | Chosen direction |
|---|---|
| Planning horizon | 18 months by default because employment is highly likely by the end of that window |
| Graduation timing | May 2027 |
| Current lease | Locked through July 2027; utilities included |
| High-yield Fidelity account | Counts toward planning funds by default; treated as near-liquid with a configurable 1–3 business-day transfer delay |
| Fidelity Go | Visible in total assets and may be considered in full-scenario planning, but separately labeled as volatile/invested rather than equivalent to cash |
| Goal reservation | Yes; goals reserve actual portions of account balances |
| Trip modeling for MVP | One total target amount and one target date per trip |
| Future trip modeling | Optional sub-buckets for flight, lodging, food, activities, etc. |
| Future cost estimating | Optional AI-assisted cost-range estimates with transparent assumptions and manual override |
| Forecast timing | Monthly forecast for MVP; one-time items may retain optional exact dates for future calendar/timing logic |
| Insufficient money behavior | Show shortfalls, causes, dates, and affected goals; do not automatically move money or silently reprioritize goals |

---

## 15. Open questions before implementation

These do not block the product brief, but they should be answered before finalizing the detailed technical plan.

1. What is the desired target month for moving into a new Atlanta-area place after the July 2027 lease end?
2. What minimum checking-floor amount feels safe: a fixed dollar figure, one month of required bills, or both?
3. What is the preferred emergency-fund target: a fixed amount, a number of months of essential expenses, or both?
4. Should goal reservations be limited to cash/near-cash accounts by default, or can a goal reserve a portion of Fidelity Go with a prominent warning?
5. Should the first version support only one user with personal data, or should multi-user support be designed into the data model for a future shared-travel/household feature?
6. What would make the first demo feel successful: a polished personal dashboard, a rigorous scenario simulator, strong security documentation, or all three?
7. Which account-allocation outputs would be most useful: cash needed for commitments, amount exposed to market volatility, a suggested conservative cash buffer, or scenario comparisons between allocation choices?

---

## 16. Next phase: technical implementation plan

After answering the remaining open questions, create a separate implementation plan covering:

- Technology stack selection.
- System architecture.
- Database schema and relationships.
- Forecasting engine design.
- Scenario-versioning model.
- Account-liquidity and volatility model.
- Goal-reservation logic.
- API route specification.
- Authentication/authorization approach.
- Frontend component tree and UX flows.
- Test strategy for forecast calculations, shortfall detection, and access control.
- Security threat model and mitigation checklist.
- Deployment, monitoring, backup, and data-deletion plan.
- Milestones mapped to the available 3,500 Perplexity build credits.
