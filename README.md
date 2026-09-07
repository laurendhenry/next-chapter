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
src/ui      React screens and components — never computes money
src/store   Zustand store, calls the engine on every mutation
src/engine  PURE functions. No React, no browser APIs, no I/O, no Date.now()
src/storage StorageAdapter interface + LocalStorageAdapter + migrations + JSON portability
src/types   Cents branded type, plan/scenario/forecast shapes
```

Two rules hold the app together:

1. `src/engine` imports nothing from `ui`, `store`, or `storage`. It is `forecast(input) => output`.
2. The UI never does arithmetic on money. Every number on screen came from `ForecastResult`.

All money is **integer cents** behind a branded `Cents` type. Divisions round against the
user: contributions round up, available funds round down.

## Docs

- `docs/product-brief.md` — the original product brief
- `docs/implementation-plan.md` — the full build plan
- `docs/calculations.md` — every formula in plain language (Phase 6)
- `docs/db-migration.md` — the deferred Phase D backend plan (Phase 2)

## Notes / deviations from the plan

- **Routing uses `HashRouter`, not browser history.** The plan called for hash-free URLs,
  but the preview is hosted as a plain static bundle with no server-side rewrite rule, so a
  refresh on `/goals` would 404. Hash routing makes deep links work on static hosting.
  Swapping back to `BrowserRouter` is a one-line change once there is a server (Phase D).
