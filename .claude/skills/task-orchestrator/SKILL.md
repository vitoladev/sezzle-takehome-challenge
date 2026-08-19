---
name: task-orchestrator
description: |
  Drive a GitHub parent issue end to end — dispatch each sub-issue
  to its executor agent (backend-executor / frontend-executor), verify and
  code-review every slice, and publish a gh-stack of PRs, one per
  sub-issue. Invoke as /task-orchestrator <issue number or slug>.
disable-model-invocation: true
---

# Task orchestrator

Drive one parent issue to a verified, reviewed, published stack of pull
requests — one PR per sub-issue, each showing only its own slice. You
orchestrate — read, dispatch, gate, ship, report. Implementation happens
inside spawned agents, never in your own context; your context holds the
issue set and the verdicts, not the diffs.

The run is autonomous: invocation is the user's explicit ask (CLAUDE.md's
commit gate) and authorizes spawning agents, editing code through them,
running devcontainer commands, committing, pushing the stack, and opening
its PRs. Merging stays with the user (`gh stack merge`).

Every slice passes the same gate before the next one starts: verified
(`verify-backend-output` / `verify-frontend-output`), committed, and
reviewed clean — zero P0/P1 findings from the `slice-review` skill, which
drives Claude's built-in `code-review` once per touched partition.

## 1. Resolve the issue set

The argument names a GitHub parent issue: a number or issue URL. This
skill's own `references/` folder carries the templates that define issue
structure: `parent.md` = feature PRD + acceptance criteria + sub-issue
list; `sub-issue-backend.md` / `sub-issue-frontend.md` = numbered
requirements + implementation plan with a Verify command. Read the
templates first — their section names are the parse targets for
everything below. Read, in order:

1. The parent: `gh issue view <n> --json title,body,labels` — PRD, scope,
   non-goals, acceptance criteria, and any dependency it names on an
   earlier parent (which must be merged first).
2. Its native sub-issues (`gh api graphql` on the parent's `subIssues`
   field; the parent body's task list is the fallback) — each labeled
   `backend`, `frontend`, or `contract`; read every body.
3. The contract: `packages/api-contract/openapi.yaml` (or the contract
   sub-issue if it does not exist yet).
4. `CONTEXT.md` entries for every domain term the issues use.

**Validate against the templates before planning.** A parent missing its
acceptance criteria, or a sub-issue missing numbered requirements or its
Verify command, is malformed input: stop and report which template
section is absent from which issue — never infer the missing section.
(Comparing an issue against its template section-by-section is the check;
prose differences within a section are fine.)

Then plan and start the stack (git runs on the host; the `gh-stack` skill
carries the mechanics and non-interactive rules). One stack per parent, one
branch per sub-issue, ordered bottom-up by dependency — contract, then
backend, then frontend — each named for its sub-issue,
`issue-<n>-<concern>` (`issue-12-workers-api`, `issue-13-workers-ui`).
From up-to-date `main`, init with only the first branch
(`gh stack init issue-12-workers-api`); each later branch is added by
`gh stack add` when its predecessor passes the gate. Never dispatch with
`main` checked out.

Complete when every sub-issue is listed with its label, its verification
route (backend → `verify-backend-output`, frontend →
`verify-frontend-output`, contract → regen no-diff check), its stack
branch name in dependency order, and the bottom branch is checked out.

## 2. Assemble one context packet per sub-issue

A packet is the dispatch prompt for an executor agent. The executors —
`backend-executor` (label `backend` or `contract`) and `frontend-executor`
(label `frontend`) — carry the ground rules themselves (guidelines,
devcontainer boundary, contract-first, no commits), so the packet carries
only the slice: issue numbers, scope, and done-bar. Point at issue numbers
and files rather than pasting them — the agent reads its own spec with
`gh issue view`. Every packet uses this template:

```text
Implement GitHub sub-issue #<n> (<title>) of parent #<n>.

Read first: the sub-issue body via gh issue view (its "Requirements" and
"Implementation plan" sections — the shape is
.claude/skills/task-orchestrator/references/sub-issue-<backend|frontend>.md),
the parent's "High-level PRD" and acceptance criteria (shape:
references/parent.md), packages/api-contract/openapi.yaml, and the
CONTEXT.md entries for: <terms>.

In scope: <the sub-issue's requirements, by number>.
Out of scope: <the parent's non-goals + the sibling sub-issue's surface>.

Done means: every numbered requirement implemented, the sub-issue's own
tests written and green, focused checks pass
(exec.sh pnpm --filter <api|web> test / lint / build), and the sub-issue's
"Verify" command produces the expected output.

Return: files changed, commands run with outcomes, and any requirement you
could not satisfy with the reason.
```

Complete when each packet names its issue numbers, in/out of scope, and a
checkable done-bar.

## 3. Dispatch, one slice at a time

Slices run serially, bottom-up — each sub-issue's work lands on its own
stack branch, and the next branch (`gh stack add <branch>`) is created only
after the current slice passes the whole gate in step 4. Sequential parents
(② before ③ before ④) stay sequential; one parent, one run.

For the current slice: confirm its branch is checked out, then dispatch one
executor agent with the slice's packet — `backend-executor` for `backend`
and `contract` slices, `frontend-executor` for `frontend` slices. When it
returns, read the report. A requirement it could not satisfy is a finding for step 4, not a
reason to re-dispatch immediately.

Complete (per slice) when the implementation report is in: files changed
and focused checks green.

## 4. Gate the slice

Three sub-gates, in order, all on the slice's own branch:

1. **Verify.** Spawn a fresh agent — never the implementer — whose prompt
   is: the parent's acceptance criteria for that surface, the sub-issue
   number, the files the implementer reported, and the instruction to invoke
   `verify-backend-output` or `verify-frontend-output` and return its
   report. On a passing frontend verification, dispatch a fresh
   `frontend-executor` to invoke `promote-e2e` — the verifier's `.verify/`
   specs become committed e2e coverage before the slice commits.
2. **Commit.** On a passing verification, dispatch the `committer` agent —
   it carries the Conventional Commits style rules; give it the sub-issue
   number for scope. The slice's diff must be fully committed before review.
3. **Review.** Spawn a fresh agent instructed to invoke the `slice-review`
   skill on the current stack branch and return its report — it runs the
   built-in `code-review` across every partition and lens defined by
   `slice-review`. The gate is its verdict: **zero
   P0/P1 findings**. P2/P3 go in the final report as advisory notes.

On findings from either verify or review:

1. Dispatch the fix to a **new** executor of the slice's type: original
   packet + the findings verbatim. Verifiers and reviewers never fix.
2. Re-run the gate from sub-gate 1 — a fix can break what already passed.
3. A fix to an already-gated **lower** slice goes to that slice's branch
   (`gh stack checkout <branch>`, fix, commit, `gh stack rebase
   --upstack`), and every slice above it re-enters the gate.

Complete (per slice) when every acceptance criterion for its surface is
Passed or reported Blocked with its cause, the work is committed, and the
review verdict is pass. Partial is not Passed. Then `gh stack add` the next
branch and return to step 3, until every sub-issue is gated.

## 5. Publish the stack

1. `gh stack submit --auto --open` — pushes every branch and opens one PR
   per slice, each based on the branch below, so reviewers see only that
   slice's diff.
2. Rewrite each PR body with `gh pr edit --body-file`, filling
   `.github/PULL_REQUEST_TEMPLATE.md` — every section, checked criteria
   paired with their evidence — plus the standard generated-by footer.
   Evidence means the verifier's observations, not the implementer's
   claims: the backend PR carries the probe outputs the verify run drove
   (curl transcripts, timing, shutdown logs); the frontend PR carries the
   rendered outcomes (exact amounts observed, states reached) — and, when
   the CI workflow has a job uploading Playwright artifacts
   (videos/screenshots/traces), points reviewers at that artifact by name.
   No such job yet? Say so under known gaps instead of citing artifacts
   that don't exist.
3. Once the pushed frontend branch's CI run goes green, invoke
   `pr-preview-media` — it converts that run's Playwright recordings to
   GIFs/stills and embeds them in the frontend PR body's `Preview`
   section, so the reviewer sees the feature without leaving the summary.
4. Merging is the user's decision (`gh stack merge`) — leave the stack
   open.

A Blocked criterion still publishes: its PR body names it prominently so
the user reviews a partial delivery knowingly, and the report leads with it.

Complete when `gh stack view --json` shows one open PR per sub-issue with
the right base chain, and each body carries its checklist.

## 6. Report

The stack's PR URLs first, bottom to top. Then per slice: agent dispatched,
files changed, commits, each acceptance criterion with its status and
evidence, and the review verdict with advisory findings. Close with
anything Blocked and what would unblock it.
