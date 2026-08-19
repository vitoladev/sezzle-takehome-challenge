# [Backend] <endpoint or behavior>

> Sub-issue of `<NN>-<slug>`. Label: `backend`.

## Requirements

<!-- Numbered and checkable — each one is a line the implementation agent's done-bar and the verify gate trace back to. Name the contract shapes (openapi.yaml), status codes, ordering, and exclusion rules explicitly. -->

1. <requirement>
2. <requirement>

## Implementation plan

<!-- The decisions, not a tutorial: which files, which seams, what the test must prove. -->

- `apps/api/...` — <what lands here and why this seam>.
- Test: <the behavior the test must prove, and at which boundary (httptest handler-level unless there's a reason not to)>.
- Verify: `scripts/devcontainer/exec.sh bash -c 'curl -s localhost:8080/api/...'` → <expected output>.
