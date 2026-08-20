# sezzle-take-home-challenge

pnpm + Turborepo monorepo:

- `apps/web` — Vite + React (TypeScript), dev server on :5173, proxies `/api/*` to :8080
- `apps/api` — Go HTTP server on :8080 (module `github.com/vitola/sezzle-take-home-challenge/api`)
- `packages/api-contract` — `openapi.yaml` is the single source of truth; codegen produces the Go server (`internal/httpapi/gen.go`) and the TS types (`src/schema.d.ts`). Generated files are committed but never hand-edited.

## Git

Commit only when the user explicitly asks. Leave finished work uncommitted
and let them decide when it becomes a commit. Invoking `/task-orchestrator`
is such an ask: that run commits, pushes, and opens its stacked PRs itself
(via `gh stack`); merging remains the user's.

Commit messages follow Conventional Commits (`feat(web): ...`,
`fix(devcontainer): ...`); the `committer` agent carries the full style rules.

## Coding guidelines

Think before coding, simplicity first, surgical changes, goal-driven
execution. The full guidance lives in the `coding-guidelines` skill
(`.claude/skills/coding-guidelines/SKILL.md`) — use it when writing,
reviewing, or refactoring code.

`docs/CODING_STANDARDS.md` is the review-facing counterpart: numbered,
citable rules (`GO-*`, `WEB-*`, `GEN-*`, `TOOL-*`) that reviews quote back.
Code review runs `mattpocock-skills:code-review` — always fully qualified,
never the unqualified `code-review`, which is Claude's built-in bug hunter.

## Devcontainer-only development

All toolchain commands (pnpm, turbo, go, node) run inside a per-worktree
devcontainer, never on the host; git runs on the host. Use the `devcontainer`
skill for the setup, exec, and teardown workflow.
