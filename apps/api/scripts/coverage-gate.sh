#!/usr/bin/env bash
# The backend coverage gate: runs the race-enabled suite, drops the generated
# and entry-point files from the profile, and fails below the threshold. CI and
# `pnpm --filter api test:coverage` both run this, so the exclusions and the
# threshold exist once. README.md § Coverage explains them.
set -euo pipefail

THRESHOLD=90
# Generated code and the process entry point, as extended-regexp fragments
# matched against the profile's `file:line.col,line.col` records.
EXCLUDED='internal/httpapi/gen\.go:|/cmd/server/'

cd "$(dirname "$0")/.."

mkdir -p tmp
go test -race -covermode=atomic -coverprofile=tmp/coverage.out ./...
grep -Ev "$EXCLUDED" tmp/coverage.out > tmp/coverage.handwritten.out

# A profile holding nothing but its `mode:` header would report a vacuous
# 0-of-0 pass, so an exclusion pattern that swallowed everything fails here.
if [ "$(wc -l < tmp/coverage.handwritten.out)" -lt 2 ]; then
	echo "coverage gate: the exclusions left no hand-written statements to measure" >&2
	exit 1
fi

go tool cover -func=tmp/coverage.handwritten.out | tee tmp/coverage.txt
# awk, because the shell compares integers and a percentage is not one.
awk -v threshold="$THRESHOLD" '
	$1 == "total:" { total = $3 + 0 }
	END {
		printf "coverage gate: %.1f%% of hand-written statements, threshold %d%%\n", total, threshold
		exit(total < threshold)
	}
' tmp/coverage.txt
