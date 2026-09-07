# Next Chapter — Budget Planner

An 18-month personal financial forecasting and scenario-planning app. Browser-first: all
data lives in `localStorage` behind a swappable storage adapter. No backend, no accounts,
no telemetry, no runtime network calls.

## Quick start

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest, single run |
| `npm run coverage` | Vitest with V8 coverage over `src/engine` |
| `npm run format` | Prettier |

## Architecture

```
src/routes      One file per screen (Plan, Timeline, Shortfalls, Scenarios)
src/components  Small local form/layout primitives — no design system
src/lib         Display formatting only (currency, month labels)
src/store       Zustand store, calls the engine on every mutation
src/engine      PURE functions. No React, no browser APIs, no I/O, no Date.now()
src/storage     StorageAdapter interface + LocalStorageAdapter + validation/migration + JSON portability
src/types       Cents branded type, plan/scenario/forecast shapes
```

Two rules hold the app together:

1. `src/engine` imports nothing from `ui`, `store`, or `storage`. It is `forecast(input) => output`.
2. The UI never does arithmetic on money. Every number on screen came from `ForecastResult`.

All money is **integer cents** behind a branded `Cents` type. Divisions round against the
user: contributions round up, available funds round down.

## Screens

| Route | What it does |
|---|---|
| `/plan` | The single data-entry screen: settings, account balances, recurring income/expenses, one-time items, housing and move-in costs, JSON export/import/reset |
| `/timeline` | All forecast months as rows, each expandable to the engine's line items for that month |
| `/shortfalls` | Every projected shortfall in chronological order, with the engine's own cause text |
| `/scenarios` | Baseline versus two editable comparison scenarios |

## Persistence

One `localStorage` document under `next-chapter:v1`, holding `schemaVersion`, the plan, the
settings and the two comparison scenarios. Every read is validated field by field: anything
unrecognisable is replaced with a safe default or dropped, and a document missing its core
shape falls back to empty seed data instead of crashing. `schema.ts` carries a
migration branch so stored data can evolve. JSON export/import reuses the same validator.

## Docs

- `docs/product-brief.md` — the original product brief
- `docs/implementation-plan.md` — the full build plan
- `docs/calculations.md` — every formula in plain language (Phase 6)
- `docs/db-migration.md` — the deferred Phase D backend plan (Phase 2)

## Scope of the current build

Built to the revised, credit-aware plan: Phase 2 (persistence + baseline entry), Phase 3
(timeline + shortfalls) and Phase 4A (baseline plus two comparison scenarios).

Deliberately **not** built yet: goals management, the dashboard route, charts, the eight
fully-configurable starter scenarios, scenario CRUD, and the Phase D backend/auth migration.
The engine types and tests already support them.

## Notes / deviations from the plan

- **Routing uses `HashRouter`, not browser history.** The plan called for hash-free URLs,
  but the preview is hosted as a plain static bundle with no server-side rewrite rule, so a
  refresh on `/goals` would 404. Hash routing makes deep links work on static hosting.
  Swapping back to `BrowserRouter` is a one-line change once there is a server (Phase D).
