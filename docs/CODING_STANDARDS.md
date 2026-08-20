# Coding standards

The documented standards for this repo. This file is the **Standards axis
source** for `mattpocock-skills:code-review` and for the `slice-review` gate:
every review finding must cite a rule here by its number (`GO-3`, `WEB-1`, …).

Scope: this file states rules a reviewer can check against a diff. The
reasoning behind the general rules — and the workflow that applies them while
*writing* code — lives in the `coding-guidelines` skill
(`.claude/skills/coding-guidelines/SKILL.md`). Where the two overlap, they say
the same thing; edit both together.

Rules marked **hard** are violations. Rules marked **judgement** are labelled
heuristics — a reviewer names them, a human decides. Skip anything the
toolchain already enforces (gofmt, vet, eslint, tsc): a linted rule is not a
review finding.

---

## GEN — Generated code

- **GEN-1 (hard).** `packages/api-contract/openapi.yaml` is the single source
  of truth. Any hand edit to a generated file — `apps/api/internal/httpapi/gen.go`,
  `packages/api-contract/src/schema.d.ts` — is a violation, no exceptions.
- **GEN-2 (hard).** A spec change and its regenerated output land in the same
  change. A regen that is a no-op must produce no diff.
- **GEN-3 (judgement).** A breaking contract change (removed field, narrowed
  type, changed status code) is named as breaking in the change description.

## CORE — Applies to every partition

- **CORE-1 (hard).** Every changed line traces to the stated request. Adjacent
  code, comments, and formatting are left alone; refactoring beyond what the
  task requires is out of scope, as is unrelated dead-code removal.
- **CORE-2 (judgement).** Nothing speculative: no abstraction around single-use
  code, no configurability that was not asked for, no error handling for
  scenarios that cannot occur.
- **CORE-3 (judgement).** Match the surrounding style — naming, idiom, comment
  density — even where you would choose differently.
- **CORE-4 (judgement).** Comments carry non-obvious *why* only: invariants,
  surprising constraints, deliberate deviations. A comment that restates the
  function name, the type, or the next line is deleted.
- **CORE-5 (hard).** A change that makes an import, variable, or function
  unused removes it — and removes nothing older than that.
- **CORE-6 (hard).** Behavioural changes ship with the tests that verify them.

## GO — `apps/api`

The anti-patterns Go makes easy. GO-1 through GO-4 are hard: each is a real
defect, not a style preference.

- **GO-1 (hard). Unsynchronized shared state.** Map writes or struct mutation
  reachable from more than one request goroutine without a mutex; a lock taken
  for reads but not writes; copying a struct that contains a mutex.
- **GO-2 (hard). Reachable panics.** Nil map write, nil deref, out-of-range
  index, or unchecked type assertion reachable from request input.
- **GO-3 (hard). Error handling.** No ignored error returns. No `err` shadowed
  by `:=` such that the outer check tests the wrong variable. No error
  swallowed into a zero value.
- **GO-4 (hard). Handler control flow.** No write to the `ResponseWriter` after
  the status is sent; every error response is followed by `return` so the
  success path cannot also run.
- **GO-5 (judgement). Leaks.** Goroutines with no exit path; tickers and timers
  never stopped; request/response bodies never closed; `defer` accumulating
  inside a loop.
- **GO-6 (judgement). Loop and closure traps.** A goroutine or closure
  capturing the loop variable; appending to a slice while ranging it; mutating
  a map during iteration.
- **GO-7 (judgement). Concurrency ordering.** Data published between goroutines
  without a channel, mutex, or atomic; `sync.WaitGroup.Add` inside the spawned
  goroutine; `time.Sleep` used as synchronization.
- **GO-8 (judgement). Cancellation.** Slow work honours `r.Context()`.

## WEB — `apps/web`

- **WEB-1 (hard). State lives in two places, never `window.*`.** UI state in
  React (`useState`/refs) owned by the feature's composition root; server state
  in TanStack Query. No `history.pushState`/`replaceState`, no
  `localStorage`/`sessionStorage`, no globals hung off `window`. A
  browser-global write is a second source of truth with no reader: it desyncs
  on Back or reload and no test fails until a human notices. A value a future
  feature will need is handed over in React state — that feature picks its own
  persistence when it exists.
- **WEB-2 (hard). Hook rules.** No conditional or loop-nested hook calls.
- **WEB-3 (hard). Effect cleanup.** Subscriptions, timeouts, and listeners are
  cleaned up. A fetch in an effect carries an abort or a staleness guard, so a
  stale response cannot overwrite a newer one.
- **WEB-4 (hard). No in-place state mutation.** State is replaced, never
  mutated.
- **WEB-5 (judgement). Effect misuse.** Missing or wrong dependency arrays;
  effects that re-derive state a render could compute.
- **WEB-6 (judgement). Stale closures.** Callbacks or intervals capturing old
  state; `setState` from the current value instead of the updater form where
  updates can batch or race.
- **WEB-7 (judgement). Render correctness.** Unstable `key`s (array index on a
  reorderable list); objects or functions recreated per render and fed to
  memoized children or effect deps, causing loops.
- **WEB-8 (judgement). Async UI races.** Double-submit on an unguarded async
  handler; loading/error flags that can deadlock because a failure path never
  resets them.
- **WEB-9 (hard). No type-safety escapes on network data.** No `any`, no
  non-null assertion, no `as`-cast applied to a response body; no unchecked
  array index rendered directly. Types come from
  `packages/api-contract/src/schema.d.ts`.

## TOOL — Scripts, CI, devcontainer, agent docs

- **TOOL-1 (hard). Shell lifecycle.** Each background process has an owned PID;
  readiness proves that exact process and endpoint; traps cover every exit
  path; cleanup cannot kill an unrelated process or leak a helper.
- **TOOL-2 (hard). Exit aggregation.** Every component failure reaches the
  final exit code. An expected-nonzero probe is isolated deliberately. Report
  assembly fails closed without erasing earlier component verdicts.
- **TOOL-3 (hard). Response validation.** A shared validator enforces the
  complete contract shape and formats; malformed JSON and wrong container types
  fail closed; numeric and status values are range-checked, never coerced.
- **TOOL-4 (judgement). Turbo and devcontainer wiring.** Task dependencies,
  cache settings, package scripts, and pinned binaries agree from package to
  root, with no hidden host-tool assumption — every toolchain command runs in
  the container.
- **TOOL-5 (judgement). Agent documentation.** Terminology and pass criteria
  agree across skills; a coverage list is defined in one place and referenced,
  never copied, so it cannot drift.
