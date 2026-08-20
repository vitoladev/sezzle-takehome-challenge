# Issue drafts

Local drafts being iterated on before they ship. **GitHub issues are the canonical version** — once a draft ships there, the local file is deleted, so this table is an index of what shipped rather than a copy of it. Nothing is in draft right now: every issue below is on GitHub. Each parent carries the feature PRD; each sub-issue carries requirements + implementation plan. Wiring on GitHub: native sub-issues under each parent, labels `backend` / `frontend`, dependency order ① → ② → ③ …

| # | Parent (feature PRD) | Sub-issues |
|---|---|---|
| ① | [#1 — Server-side calculator with session History](https://github.com/vitoladev/sezzle-takehome-challenge/issues/1) | ① [#2 Backend: contract](https://github.com/vitoladev/sezzle-takehome-challenge/issues/2) · ② [#3 Backend: calculator domain](https://github.com/vitoladev/sezzle-takehome-challenge/issues/3) · ③ [#4 Backend: HTTP + Session store](https://github.com/vitoladev/sezzle-takehome-challenge/issues/4) · ④ [#5 Frontend: calculator](https://github.com/vitoladev/sezzle-takehome-challenge/issues/5) · ⑤ [#6 Frontend: History panel](https://github.com/vitoladev/sezzle-takehome-challenge/issues/6) · ⑥ [#7 Backend: CI + docs](https://github.com/vitoladev/sezzle-takehome-challenge/issues/7) |

Dependency order is strict: #2 generates the types every other slice compiles
against, #4 needs #3's domain errors, #5 needs #4's endpoints, #6 needs #5's
session hook and layout, and #7 lands last so its coverage gates run against
finished code.

Domain decisions behind this feature: [ADR-0001 — decimal over rational](../adr/0001-decimal-over-rational.md),
[ADR-0002 — single endpoint with `oneOf`](../adr/0002-single-endpoint-with-oneof.md).

New issues start from the `task-orchestrator` skill's own [references/](../../.claude/skills/task-orchestrator/references/) — `parent.md`, `sub-issue-backend.md`, `sub-issue-frontend.md` — the templates live inside the skill so the orchestrator and the drafts always share one copy. Slice PRs follow [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md).

Domain vocabulary: see [/CONTEXT.md](../../CONTEXT.md) — every domain term an issue uses gets an entry there first.
