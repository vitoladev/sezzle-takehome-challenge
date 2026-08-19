---
name: slice-review
description: |
  Review gate for one stack slice: runs Claude's built-in code-review skill
  once per touched partition with that partition's diff and its bug-hunting
  lens, then maps findings to a P0–P3 verdict. Use when a task-orchestrator
  gate names it or when asked to gate-review a slice or stack branch. Pass =
  zero P0/P1.
---

# Slice review

Gate one slice by driving Claude's `code-review` skill per partition — never a
hand-rolled review of your own. Your job is scoping, context, and the
verdict: **pass = zero P0/P1 findings**. You review and report — fixes are
dispatched by the caller, never applied here.

## 1. Scope the slice

The diff is the current stack branch against its base: `gh stack view
--json` names the branch below (trunk `main` for the bottom branch), then
`git diff --stat <base>...HEAD` (git on the host) lists the slice's files.
Partition them as `apps/api`, `apps/web`,
`packages/api-contract`, other. Acceptance criteria are the verify gate's
job — this gate hunts real bugs in the code itself.

Generated files (`apps/api/internal/httpapi/gen.go`, generated TS in
`packages/api-contract`) are checked by you directly, not sent to review:
any hand edit to generated code is a P0.

## 2. One code-review invocation per touched partition

For each touched partition, invoke the built-in `code-review` skill with the
slice's diff range scoped to that partition's path as the target, at `high`
effort, and include in the invocation the partition's lens so the reviewer
reads the diff with this repo's rules in hand:

**`apps/api` lens (Go anti-patterns).** Hunt the bugs Go makes easy:

- Unsynchronized shared state — map writes or struct mutation reached from
  multiple request goroutines without a mutex; locks taken for reads but
  not writes; copying a struct that contains a mutex.
- Goroutine and resource leaks — goroutines with no exit path, tickers and
  timers never stopped, response/request bodies never closed, `defer`
  accumulating inside a loop.
- Error handling — ignored error returns, `err` shadowed by `:=` so the
  outer check tests the wrong variable, errors swallowed and turned into
  zero values, panics reachable from request input (nil map write, nil
  deref, out-of-range index, unchecked type assertion).
- Loop and closure traps — goroutine or closure capturing the loop
  variable, appending to a slice while ranging it, mutating a map during
  iteration.
- HTTP handler traps — writing to the ResponseWriter after the status was
  sent, missing `return` after an error response so the success path also
  runs, ignoring `r.Context()` cancellation on slow work.
- Concurrency ordering — data published between goroutines without
  channel/mutex/atomic, `sync.WaitGroup.Add` inside the spawned goroutine,
  `time.Sleep` as synchronization.

**`apps/web` lens (React anti-patterns).** Hunt the bugs React makes easy:

- Effect misuse — missing or wrong dependency arrays, effects that
  re-derive state a render could compute, subscriptions/timeouts/listeners
  without cleanup, fetch-in-effect races where a stale response overwrites
  a newer one (no abort or staleness guard).
- Stale closures — callbacks or intervals capturing old state, setState
  based on current value instead of the updater form where updates can
  batch or race.
- Render correctness — state mutated in place instead of replaced,
  conditional or loop-nested hook calls, unstable `key`s (array index on
  reorderable lists), objects/functions recreated per render and fed to
  memoized children or effect deps causing loops.
- Async UI races — awaited results applied without checking the component
  or query is still current, double-submit on unguarded async handlers,
  loading/error flags that can deadlock (never reset on failure paths).
- Type safety escapes — `any`, non-null assertions, and `as`-casting
  network data; unchecked array indexing rendered directly.

**`packages/api-contract` lens.** Spec change and regenerated output land
together; a no-op regen must produce no diff. Breaking contract changes
are named as such.

**`other` lens (tooling and process).** Hunt failures at the seams outside the
product partitions:

- Shell lifecycle — each background process has an owned PID, readiness proves
  that exact process and endpoint, traps cover every exit path, and cleanup
  cannot kill an unrelated process or leak a helper.
- Exit aggregation — every component failure reaches the final exit code,
  expected nonzero probes are isolated deliberately, and report assembly fails
  closed without erasing the earlier component verdicts.
- Node schema validation — shared response validators enforce the complete
  contract shape and formats, malformed JSON and wrong container types fail
  closed, and numeric/status values are range-checked rather than coerced.
- Turbo and devcontainer wiring — task dependencies, cache settings, package
  scripts, pinned binaries, and container-only commands agree from package to
  root without hidden host-tool assumptions.
- Agent documentation — orchestration delegates partitioning and review lenses
  to this skill, terminology and pass criteria agree across skills, and copied
  coverage lists cannot drift.

## 3. Map findings to the verdict

Collect every finding from the per-partition reviews plus your generated-code
check, and classify:

- **P0** — corrupts or loses data, crashes or hangs the process, data
  race, deadlock, hand-edited generated code.
- **P1** — likely bug under real conditions: leak, stale-state race, UI
  race or render loop, swallowed error changing behavior, panic reachable
  from input.
- **P2** — robustness gap or anti-pattern not yet biting.
- **P3** — nit.

Before reporting, re-check each P0/P1 against the actual slice diff — a
finding that assumes code outside the slice behaves differently than it
does gets downgraded or dropped.

Report: verdict first (**pass** or **fail** with the P0/P1 count), then
findings grouped by partition, most severe first, each with `file:line`, the
claim, and the failure scenario. P2/P3 are advisory — the caller decides;
they never block the gate.
