#!/usr/bin/env bash
# Start (or reuse) the devcontainer for the current worktree.
# Each worktree gets its own container, keyed by the worktree's absolute path.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# In a linked worktree, .git is a file pointing into the main repo's .git dir.
# docker-compose.yml mounts that dir at the same path inside the container so
# git works there too (for the main repo it's a harmless self-mount).
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
export GIT_COMMON_DIR

# Publish fixed host ports only for the main worktree; linked worktrees get
# random free ports so parallel containers never fight over 5173/8080.
if [ "$GIT_COMMON_DIR" = "$ROOT/.git" ]; then
  export HOST_WEB_PORT=5173 HOST_API_PORT=8080
else
  export HOST_WEB_PORT=0 HOST_API_PORT=0
fi

devcontainer up --workspace-folder "$ROOT"


echo
echo "Devcontainer ready for: $ROOT"
echo "Run commands in it with: scripts/devcontainer/exec.sh <cmd> [args...]"
