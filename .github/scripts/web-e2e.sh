#!/usr/bin/env bash
# Runs the committed Playwright suite against built assets rather than the dev
# server: the Go API on :8080, and `vite preview` serving apps/web/dist on
# :5173. preview reuses the dev server's /api proxy, so the built page reaches
# the API exactly as it does under `pnpm dev`, and playwright.config.ts's
# hardcoded baseURL is why the port is pinned with --strictPort.
set -euo pipefail

cd "$(dirname "$0")/../.."

api_pid=""
preview_pid=""

# Only the PIDs this script started, so a server the developer is already
# running is never the one killed.
cleanup() {
	local status=$?
	# `|| true` on each: under `set -e` a kill whose process is already gone
	# would end the script from inside the trap, replacing the suite's verdict
	# with the trap's own. The captured status is what leaves this script.
	[ -n "$api_pid" ] && kill "$api_pid" 2>/dev/null || true
	[ -n "$preview_pid" ] && kill "$preview_pid" 2>/dev/null || true
	exit "$status"
}
trap cleanup EXIT
# Not `trap cleanup INT TERM`: a signal arriving between two commands leaves $?
# at 0, so cleanup would capture 0 and report an interrupted run as a pass.
# `exit 130` sets the status first and then fires the EXIT trap, which is also
# why cleanup runs once here rather than twice.
trap 'exit 130' INT TERM

# Proves that this process is still alive and that this endpoint answers —
# a port that happens to be open is not the server we started.
wait_for() {
	local name=$1 pid=$2 url=$3
	for _ in $(seq 1 60); do
		if ! kill -0 "$pid" 2>/dev/null; then
			echo "$name exited before it answered $url" >&2
			return 1
		fi
		if curl -fsS -o /dev/null "$url"; then
			return 0
		fi
		sleep 1
	done
	echo "$name did not answer $url within 60s" >&2
	return 1
}

pnpm --filter web build
(cd apps/api && go build -o bin/server ./cmd/server)

apps/api/bin/server &
api_pid=$!

# `exec` replaces the subshell, so $! is vite itself rather than a wrapper
# that would leave it orphaned when killed.
(cd apps/web && exec ./node_modules/.bin/vite preview --port 5173 --strictPort) &
preview_pid=$!

wait_for "the API" "$api_pid" http://localhost:8080/api/health
wait_for "vite preview" "$preview_pid" http://localhost:5173/

pnpm --filter web test:e2e
