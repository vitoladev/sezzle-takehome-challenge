---
name: devcontainer
description: |
  Per-worktree devcontainer workflow for this repo — every toolchain command
  (pnpm, turbo, go, node, vite) runs inside a container, one container per git
  worktree. Use when: starting work in a new or existing worktree, running
  build/test/lint/dev commands, verifying a running server or endpoint,
  tearing down a finished worktree, or debugging container/mount/cache errors.
---

# Per-worktree devcontainers

Each git worktree gets its own container holding its own copy of the frontend
and backend, so parallel agents never collide. Toolchain commands run inside
the container; git commands run on the host.

Config source of truth: `.devcontainer/Dockerfile` — the image with all the
batteries (Ubuntu + Node + pnpm via corepack + Go + air), referenced from
`.devcontainer/devcontainer.json`. Add tooling to the Dockerfile, then rebuild
with `down.sh && up.sh`. The lifecycle scripts live in `scripts/devcontainer/`.

## 1. Setup — entering a worktree

Create worktrees at the convention path:

```sh
git worktree add ~/development/sezzle-take-home-challenge-worktrees/<branch> -b <branch>
```

Then, from inside the worktree:

```sh
scripts/devcontainer/up.sh
```

Idempotent — run it whenever unsure the container exists. It starts a
container keyed to this worktree's path, runs `pnpm install` inside it, and
for linked worktrees mounts the main repo's `.git` dir so git also works
in-container. Setup is complete when it prints `Devcontainer ready for: <path>`.

## 2. Running commands

Prefix every toolchain command with `scripts/devcontainer/exec.sh`:

```sh
scripts/devcontainer/exec.sh pnpm build
scripts/devcontainer/exec.sh pnpm --filter api dev
scripts/devcontainer/exec.sh bash -c 'curl -s localhost:5173/api/health'
```

Servers started in the container are reachable only from inside it — verify
endpoints with an `exec.sh ... curl`, as in the last example above.

`pnpm install` also belongs inside the container: `node_modules` holds Linux
binaries, and a host-side install would replace them with macOS ones.

## 3. Teardown — leaving a worktree

Remove the container before the worktree:

```sh
scripts/devcontainer/down.sh   # from inside the worktree
cd <main-repo> && git worktree remove <path>
```

`down.sh` matches the container by the worktree's path label, so other
worktrees' containers are untouched. Teardown is complete when both the
container and the worktree are gone.

## Reference: stray containers

A worktree deleted without `down.sh` leaves its container behind. List
candidates and remove any whose path no longer exists:

```sh
docker ps -a --filter "label=devcontainer.local_folder" \
  --format '{{.ID}}  {{.Label "devcontainer.local_folder"}}'
docker rm -f <id>
```

Containers labeled with paths outside this repo's worktrees belong to other
projects — leave them.

## Reference: known failure modes

- `bind source path does not exist` on `up.sh` → the worktree path isn't
  shared with Docker Desktop (Settings → Resources → File Sharing). Keep
  worktrees under the convention path, which lives in `/Users` and is shared
  by default.
- Turbo `Permission denied` writing `.turbo/cache` under the main repo's path
  → `TURBO_CACHE_DIR` pins the cache to the workspace in `devcontainer.json`;
  the container predates that setting. Recreate it: `down.sh` then `up.sh`.
- Any change to `.devcontainer/devcontainer.json` applies only to newly
  created containers — `down.sh` then `up.sh` to pick it up.
