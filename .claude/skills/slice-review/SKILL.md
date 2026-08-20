---
name: slice-review
description: |
  Review gate for one stack slice: runs the `mattpocock-skills:code-review`
  skill over the slice diff against `docs/CODING_STANDARDS.md` and the
  slice's sub-issue, then maps its two-axis findings to a P0–P3 verdict.
  Use when a task-orchestrator gate names it or when asked to gate-review a
  slice or stack branch. Pass = zero P0/P1.
---

# Slice review

Gate one slice by driving the **`mattpocock-skills:code-review`** skill — the
plugin skill, not Claude's built-in `code-review`, and never a hand-rolled
review of your own. Your job is scoping, context, and the verdict: **pass =
zero P0/P1 findings**. You review and report — fixes are dispatched by the
caller, never applied here.

Name the skill fully qualified (`mattpocock-skills:code-review`) every time
you invoke it. The unqualified name `code-review` resolves to Claude's
built-in bug-hunting review, which is a different skill with a different
output shape and is not this gate.

## 1. Scope the slice

The diff is the current stack branch against its base: `gh stack view --json`
names the branch below (trunk `main` for the bottom branch). That base is the
**fixed point** the review skill requires. Confirm it resolves (`git rev-parse
<base>`) and that `git diff --stat <base>...HEAD` is non-empty before invoking
anything — a bad ref must fail here, in front of you, not inside two
sub-agents.

Note the touched partitions (`apps/api`, `apps/web`,
`packages/api-contract`, other) from that `--stat` output: you need them to
group the report in step 3, not to split the review.

The review is three-dot and commit-based, so **uncommitted work is invisible
to it**. If `git status --porcelain` is dirty, stop and report that the slice
is not fully committed — do not review a partial diff.

Generated files (`apps/api/internal/httpapi/gen.go`, generated TS in
`packages/api-contract`) are checked by you directly, not sent to review: any
hand edit to generated code is a P0 (`GEN-1`).

## 2. One `mattpocock-skills:code-review` invocation per slice

Invoke it **once** for the whole slice — its axes split by concern, not by
path, and the per-partition rules live in the standards doc where both axes
can read them. Pass:

- **Fixed point:** the base branch from step 1.
- **Standards source:** `docs/CODING_STANDARDS.md`. It is canonical and it
  overrides the skill's built-in Fowler smell baseline wherever the two
  disagree. Its `GO-*`, `WEB-*`, `GEN-*`, `DOC-*`, `TOOL-*` rules are this repo's
  partition lenses — keep them there, never restate them in this file, or the
  two copies drift (`TOOL-5`).
- **Spec source:** the slice's sub-issue (`gh issue view <n>`). With no
  sub-issue, say so and let the Spec axis report "no spec available" rather
  than inferring requirements from the code.
- **Guard, appended to both sub-agent briefs verbatim:** "Do not invoke
  `/code-review` or spawn additional agents; perform this review directly."
  Without it a sub-agent can rediscover the skill and fan out — a known bug in
  the shipped skill.

## 3. Map findings to the verdict

The skill returns two blocks, `## Standards` and `## Spec`. Do not rerank
across them — classify each finding on its own:

- **P0** — corrupts or loses data, crashes or hangs the process, data race,
  deadlock, hand-edited generated code. Spec side: a required behaviour is
  absent, not merely partial.
- **P1** — a **hard** rule in `docs/CODING_STANDARDS.md` breached, or a likely
  bug under real conditions: leak, stale-state race, UI race or render loop,
  swallowed error changing behavior, panic reachable from input. Spec side: a
  requirement implemented wrongly.
- **P2** — a **judgement** rule or a named smell; a robustness gap not yet
  biting. Spec side: scope creep, or a partial requirement whose gap is
  cosmetic.
- **P3** — nit.

A Standards finding with no cited rule and no named smell, or a Spec finding
that quotes no line of the sub-issue, is not evidence — drop it or demote it
to P3. Sub-agent output is a hypothesis: before reporting, re-check each
P0/P1 against the actual slice diff, and downgrade or drop any finding that
assumes code outside the slice behaves differently than it does.

Report: verdict first (**pass** or **fail** with the P0/P1 count), then the
two axes under their own headings, findings grouped by partition within each,
most severe first, each with `file:line`, the cited rule or smell, and the
failure scenario. P2/P3 are advisory — the caller decides; they never block
the gate.
