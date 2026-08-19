---
name: verify-frontend-output
description: |
  Verify user-visible browser behavior with Playwright CLI against the
  running dev servers. Use after changes to apps/web (screens, components,
  loading/error/empty states, submit or tracking flows), when a
  task-orchestrator dispatch names it, or when asked to prove a frontend
  acceptance criterion.
---

# Verify frontend output

Verify the changed user experience, not that the frontend compiles.
Playwright CLI is the authoritative browser driver; the verdict comes from
states you drove the browser into and observed.

You verify and report. Findings go back to the dispatcher — propose the
smallest fix, change nothing yourself.

## 1. Build the scenario list

Read the sub-issue, the parent's acceptance criteria, and the contract.
Turn each user-observable criterion into a scenario: the state to reach,
how to reach it through the real UI, and the exact expected observation.
The recurring surfaces in this product:

- **Rendered truth** — API data rendered correctly (locale-correct
  formatting via `Intl.NumberFormat` where money or dates appear, never a
  raw string paste).
- **The three intentional states** — loading skeleton, error with a working
  retry, empty state. Reach each for real: throttle or stop the API for
  error, use an empty response for empty — asserting on markup that never
  rendered proves nothing.
- **Flows** — the user-visible multi-step interactions the change touches,
  driven end to end through the real UI.

Every scenario also watches console errors and failed network requests.

## 2. Stand the system up

Follow the devcontainer skill: `up.sh`, then both servers in the background
(`exec.sh pnpm --filter api dev`, `exec.sh pnpm --filter web dev`), then
health-check through the proxy from inside the container
(`exec.sh bash -c 'curl -s localhost:5173/api/health'`).

**Tooling gate.** Playwright must run inside the container (toolchain
boundary). Check availability first: `exec.sh bash -c 'pnpm exec playwright
--version'`. If it or its browsers are absent, the route is the
devcontainer skill's Dockerfile path (add Playwright + Chromium deps,
rebuild) — surface that as a setup decision for the user or dispatcher and
report affected scenarios **Blocked**; a silent host-side install breaks
the container boundary and an npm install breaks the no-new-dependency
default.

## 3. Drive the scenarios

Write a throwaway Playwright spec per scenario group under the worktree
(e.g. `.verify/` — the container only sees mounted paths; deleted in
step 5), run with
`exec.sh pnpm exec playwright test`. Single static states may instead use
`exec.sh pnpm exec playwright screenshot <url> <out.png>`.

Each spec: reach the state through the UI, assert the visible outcome with
locators scoped to the relevant region, assert a locator is visible before
acting so a missing control fails fast, capture one screenshot per proved
state with a semantic name (`list-loaded`, `error-retry`,
`empty-state`), and fail on any console error or failed request the
scenario did not deliberately cause.

## 4. Judge each scenario

**Passed** only for observed outcomes — a screenshot or assertion for every
claim. **Failed** with evidence, a cause classification (product bug,
contract mismatch, environment, spec ambiguity), and the smallest proposed
fix. **Blocked** when the state could not be reached, with what stood in
the way. Partial is not Passed.

## 5. Report

Per scenario: status, evidence (screenshot paths, assertion output),
console/network observations. Then criteria left unverified and why, and
any durable coverage worth adding (recommend only — the dispatcher
decides). Leave the specs in `.verify/` and name them in the report — a
promote-e2e pass may promote them into the committed suite (`.verify/` is
git-ignored, so they ride no commit). Remove screenshots you no longer
need as evidence.
