# Issue drafts

Local drafts being iterated on before they ship. **GitHub issues are the canonical version** — once a draft ships there, the local file is deleted. Each parent carries the feature PRD; each sub-issue carries requirements + implementation plan. Wiring on GitHub: native sub-issues under each parent, labels `backend` / `frontend`, dependency order ① → ② → ③ …

| # | Parent (feature PRD) | Sub-issues |
|---|---|---|
| ① | _none yet_ | |

New issues start from the `task-orchestrator` skill's own [references/](../../.claude/skills/task-orchestrator/references/) — `parent.md`, `sub-issue-backend.md`, `sub-issue-frontend.md` — the templates live inside the skill so the orchestrator and the drafts always share one copy. Slice PRs follow [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md).

Domain vocabulary: see [/CONTEXT.md](../../CONTEXT.md) — every domain term an issue uses gets an entry there first.
