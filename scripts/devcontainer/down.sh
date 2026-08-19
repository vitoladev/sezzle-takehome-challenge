#!/usr/bin/env bash
# Remove the devcontainer belonging to the current worktree.
# The devcontainer CLI labels containers with the workspace path, so this
# only touches the container for THIS worktree, never other worktrees'.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

IDS="$(docker ps -aq --filter "label=devcontainer.local_folder=$ROOT")"
if [ -z "$IDS" ]; then
  echo "No devcontainer found for: $ROOT"
  exit 0
fi

# The devcontainer is compose-based: tear down its whole compose
# project so its network goes with it.
PROJECT="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' $(echo "$IDS" | head -n1))"
if [ -n "$PROJECT" ]; then
  docker compose -p "$PROJECT" down --remove-orphans
else
  echo "$IDS" | xargs docker rm -f
fi
echo "Removed devcontainer for: $ROOT"
