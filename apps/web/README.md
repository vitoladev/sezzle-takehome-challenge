# apps/web

Vite + React front end for the server-side Calculator: keypad entry with
arity-aware Operand fields, an Exactness indicator, and the Session's History.
Dev server on `:5173`, proxying `/api/*` to the Go API on `:8080`.

Setup, `pnpm dev`, and the devcontainer workflow live in the
[repo README](../../README.md). Domain terms — Calculation, Operation, Operand,
Result, Exactness, Precision, Session, History — are in
[`CONTEXT.md`](../../CONTEXT.md).

## Layout

[`App.tsx`](src/App.tsx) is the composition root and holds no logic: the
QueryClient, the page frame, the header lamp, and the Calculator screen.
`main.tsx` mounts it and nothing else.

Features follow the bounded contexts of `CONTEXT.md`, not the boxes on screen:

| Folder | Context | What it owns |
| --- | --- | --- |
| `src/features/calculator/` | Arithmetic, Precision | Operation choice, Operand entry, submitting a Calculation, rendering its Result |
| `src/features/history/` | Record-keeping | The Session's History panel and its rows |
| `src/features/session/` | Record-keeping | The per-tab Session identifier |
| `src/features/health/` | — | The header lamp fed by `GET /health` |

Each feature splits by kind:

```
src/features/<context>/
  screens/       screen-level composition (state, submit, wire children)
  components/    presentational pieces reused inside the feature
  hooks/         TanStack Query against the contract
  model/         pure rules — no React, no fetch
```

Only the calculator has a `model/`: `operations.ts` (the arity and Operand
roles each Operation takes, and the request it builds), `entry.ts` (what a
keypad press does to an Operand string), `keyboard.ts` (physical key → keypad
action). They are pure functions, so their tests need no DOM.

Two cross-feature edges, both deliberate:

- **`calculator/screens/Calculator.tsx` renders `history/components/HistoryPanel`.**
  Carrying a Result out of History into the next Calculation writes the
  calculator's Operand state, so the screen owns the wiring; the panel only
  reports which Result was chosen.
- **`history/components/HistoryRow.tsx` reads `calculator/model`**
  (`OPERATIONS`, `isCompleteOperand`): a History row names the same Operand
  roles the keypad enters and refuses to carry a Result an Operand may not
  hold. The direction is one-way — `model/` imports no feature.

**Shared, not features:**

- `src/api/` — the typed `openapi-fetch` client and the request functions that
  name the `X-Session-Id` header (`client.ts`), plus the query keys that bind a
  cache entry to a Session (`keys.ts`). Not a barrel.
- `src/ui/` — `InexactMarker`, `RetryButton`: the pieces both features render,
  so `≈` means one thing and a refusal is never a dead end
- `src/utils/` — helpers used by more than one feature (`describeError` maps a
  thrown value to the code and message a visitor reads; `result.ts` decides
  when a Result is long and counts its digits)
- `src/index.css` — Tailwind v4 entry, design tokens, component classes

Cross-module imports use the `@/` alias (`src/`) and keep the file extension
(`@/api/client.ts`). Neighbours inside a feature stay relative
(`../model/entry.ts`).

## Styling

Tailwind v4 via `@tailwindcss/vite`, used for its token and layer system rather
than as utilities on the markup: `@theme` defines the palette and type scale,
and `@layer components` holds the named classes the components wear (`.ticket`,
`.key`, `.readout`, `.history-row`). Dark is the only mode — `color-scheme:
dark` on `:root`, no toggle and no `.dark` class.

## Tests

### Unit (`src/**/*.test.{ts,tsx}`)

Vitest Browser Mode (`vitest-browser-react`) in real Chromium, each test file
next to the module it covers. Screens and components are driven through the
rendered DOM; `model/` and `utils/` are plain Vitest.

Coverage is gated at 90% of statements and lines over **every** module under
`src/` — including ones no test imports — with `main.tsx` excluded. The repo
README's [Coverage](../../README.md#coverage) section is where that exclusion
list is written down.

```sh
scripts/devcontainer/exec.sh pnpm --filter web test
scripts/devcontainer/exec.sh pnpm --filter web test:coverage
```

### E2E (`e2e/`)

Playwright against the **running** Vite + API servers (`pnpm dev`), grouped by
flow rather than by feature folder:

```
e2e/
  calculator.spec.ts   entry, submit, every error form, the three states
  history.spec.ts      the panel, carrying a Result, Session isolation
  health.spec.ts       the header lamp
```

Locators go through `data-testid` and `data-*` state attributes (`data-state`,
`data-exact`, `data-error-code`), never through copy. Operands, Results, and
Session identifiers are data — those stay asserted.

```sh
scripts/devcontainer/exec.sh pnpm dev                 # leave running
scripts/devcontainer/exec.sh pnpm --filter web test:e2e
```
