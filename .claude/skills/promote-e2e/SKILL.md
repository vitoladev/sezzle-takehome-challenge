---
name: promote-e2e
description: |
  Promote the throwaway Playwright specs a verify-frontend-output run left in `.verify/` into the committed e2e suite (`apps/web/e2e`). Use after a frontend verification passes, when a task-orchestrator gate names it, or when asked to turn verification scenarios into durable e2e coverage.
---

# Promote verification specs to e2e coverage

A verification run and the e2e suite are the same artifact at different lifetimes: the verifier already wrote specs that reach real states and assert real outcomes — proven against the live stack. Promote them instead of letting them die with the run.

You edit the e2e surface only: `apps/web/e2e` plus its harness when a piece is missing (`playwright.config.ts`, the `test:e2e` script in `apps/web/package.json`) — the first promotion in a repo may be the one that births the suite. Product code stays untouched. The verifier's verdict is already in; a promotion never re-litigates it.

## 1. Collect

Read the verification report and the specs it preserved under `.verify/` in the worktree. If `.verify/` is gone, rebuild from the report's scenario list — each scenario names the state reached, how, and the assertion.

## 2. Select

A scenario earns promotion when it covers a state or path the committed suite (`apps/web/e2e/*.spec.ts`) does not already assert. Skip scenarios that duplicate existing coverage or that only probed the environment (health checks, tooling gates). The verifier's "durable coverage worth adding" recommendations are the priority list.

## 3. Promote

Rewrite, don't copy. Verification specs are throwaway-shaped; the committed suite is not:

- Assert against the running system's actual responses (fetch the API in the spec) or a mocked route — a literal expected string is only safe on a mocked route. Live data mutates; a spec pinned to a literal row fails permanently once that row changes.
- Fold each scenario into the existing spec file for its surface, matching its locator and naming style; keep screenshots out (assertions are the durable form).
- Delete `.verify/` when done — everything worth keeping now lives in `apps/web/e2e`.

## 4. Prove

`exec.sh pnpm --filter web test:e2e` green against the running dev servers (devcontainer skill), including the promoted specs. Report: scenarios promoted (with their new spec names), scenarios skipped and why.
