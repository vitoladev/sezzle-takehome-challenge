# sezzle-take-home-challenge

A pnpm + Turborepo monorepo boilerplate with a React frontend and a Go REST backend:

- **`apps/web`** — Vite + React (TypeScript). Dev server on `:5173`, proxying `/api/*` to the backend.
- **`apps/api`** — Go HTTP server on `:8080`, exposing the API under `/api/*` (e.g. `/api/health`). Wrapped in a `package.json` so Turborepo orchestrates it like any other package.
- **`packages/api-contract`** — contract-first: `openapi.yaml` is the single source of truth. `pnpm generate` produces the Go server interfaces (`apps/api/internal/httpapi/gen.go` via oapi-codegen) and the TypeScript types + client (`src/schema.d.ts` via openapi-typescript / openapi-fetch).

## Requirements

Development happens **inside a devcontainer** — the host machine needs no Node, pnpm, or Go toolchain. You need:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**
- **[devcontainer CLI](https://github.com/devcontainers/cli)** (`brew install devcontainer`)
- **git**

```sh
scripts/devcontainer/up.sh              # build + start the container, install deps
scripts/devcontainer/exec.sh pnpm dev   # web on :5173, api on :8080
```

Open **http://localhost:5173** — the page shows the API health check going green. That's it.

## Tests

```sh
scripts/devcontainer/exec.sh pnpm test              # backend (go test -race) + frontend units
scripts/devcontainer/exec.sh pnpm --filter web test:e2e   # Playwright, needs pnpm dev running
```

## Extending the API

1. Edit `packages/api-contract/openapi.yaml`.
2. `scripts/devcontainer/exec.sh pnpm generate` — regenerates `gen.go` and `schema.d.ts` (commit both; never hand-edit them).
3. Implement the new `ServerInterface` method on `Server` in `apps/api/internal/httpapi/`.
4. Consume the typed client from `@sezzle/api-contract` in `apps/web`.
