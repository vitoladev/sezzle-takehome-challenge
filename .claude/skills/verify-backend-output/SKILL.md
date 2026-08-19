---
name: verify-backend-output
description: |
  Verify observable Go API behavior by wiring real HTTP requests and driving
  multi-step flows inside the devcontainer. Use after changes to apps/api
  (handlers, store, provider, contract wiring), when a task-orchestrator
  dispatch names it, or when asked to prove a backend acceptance criterion.
---

# Verify backend output

Prove behavior with executed requests, not code reading. A compiling server
and a green broad suite are supporting evidence; the verdict comes from
requests you sent and responses you observed.

You verify and report. Findings go back to the dispatcher — propose the
smallest fix, change nothing yourself.

## 1. Build the scenario list

Read the sub-issue, the parent's acceptance criteria, and
`packages/api-contract/openapi.yaml`. Turn each criterion into a scenario:
the request(s) to send, the exact observable outcome (status code, body
shape, ordering), and any prior state it needs. Every scenario traces to a
criterion or a contract clause; every backend criterion gets a scenario or
an explicit Blocked with the reason.

## 2. Stand the system up

Follow the devcontainer skill: `up.sh` if unsure the container exists, then
start the API in the background
(`exec.sh pnpm --filter api dev`) and health-check it from inside the
container before any scenario runs
(`exec.sh bash -c 'curl -s localhost:8080/api/health'` or the sub-issue's
own Verify command). A server that never comes up is a Blocked verdict with
the startup log as evidence, and stops the run.

## 3. Wire requests and drive flows

Send every scenario's requests with `exec.sh bash -c 'curl -s ...'`,
recording the exact command and response for evidence. Single requests
check shape; **flows** check the product:

- **List truth** — list endpoints return exactly the rows the state
  implies; value formats match the contract; ordering is stable across two
  fetches.
- **Write semantics** — create/update endpoints: success status and body
  shape per the contract; invalid input rejected with the contract's error
  shape; replays and conflicts behave as the contract specifies.
- **Multi-step flows** — resources re-fetched across state transitions
  reach the documented terminal states; unknown ids `404`.

Drive only the flows the changed surface touches; name the ones you skipped.

## 4. Check the contract and the tests

- Regen is a no-op: `exec.sh pnpm generate` then `git diff --exit-code`
  (git on the host) — drift between spec and generated code fails this.
- Run the package's own tests: `exec.sh pnpm --filter api test`. When the
  sub-issues name required test deliverables, a missing required test is a
  Failed finding, not a note.

## 5. Report

Per scenario: **Passed**, **Failed**, or **Blocked** — never a status for
an outcome you did not observe. Each verdict carries its evidence: the
command, the response (redact nothing here — this API holds fixture data
only), and for failures a cause classification (product bug, contract
drift, environment, spec ambiguity) plus the smallest proposed fix. Close
with the criteria left unverified and why.
