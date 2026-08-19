#!/usr/bin/env bash
# Run a command inside this worktree's devcontainer, e.g.:
#   scripts/devcontainer/exec.sh pnpm build
#   scripts/devcontainer/exec.sh pnpm --filter api test
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

# docker-compose.yml interpolates this on every devcontainer CLI invocation.
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
export GIT_COMMON_DIR

exec devcontainer exec --workspace-folder "$ROOT" "$@"
