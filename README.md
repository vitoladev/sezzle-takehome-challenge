# Calculator

A calculator whose arithmetic runs on the server, so precision behaviour is
defined in one place and observable over the API rather than hidden inside a
browser's number type. `0.1 + 0.2` returns `"0.3"`, and every Result says
whether it is exact.

| Workspace | What it holds |
|---|---|
| `apps/web` | Vite + React (TypeScript). Keypad entry with arity-aware Operand fields, an Exactness indicator, and a History panel. Dev server on `:5173`, proxying `/api/*` to the backend. Layout is documented in [apps/web/README.md](apps/web/README.md). |
| `apps/api` | Go HTTP server on `:8080` serving `/api/*`. Arbitrary-precision decimal arithmetic, contract validation at the edge, in-memory History per Session. |
| `packages/api-contract` | Contract-first. `openapi.yaml` is the single source of truth; `pnpm generate` produces the Go server interfaces (`gen.go`) and the TypeScript types and client (`schema.d.ts`). Both are committed and never hand-edited. |

The domain vocabulary these documents use (Calculation, Operation, Operand,
Result, Exactness, Precision, Session, History) is defined in
[CONTEXT.md](CONTEXT.md).

## Setup

Development happens **inside a devcontainer**, so the host machine needs no
Node, pnpm, or Go toolchain. You need
[Docker Desktop](https://www.docker.com/products/docker-desktop/), the
[devcontainer CLI](https://github.com/devcontainers/cli)
(`brew install devcontainer`), and git.

```sh
scripts/devcontainer/up.sh    # build + start the container, install deps
```

## Running

```sh
scripts/devcontainer/exec.sh pnpm dev    # web on :5173, api on :8080
```

Open **http://localhost:5173**. The header carries a health lamp fed by
`GET /api/health`, so a backend that is not running is visible rather than
silently inferred from a failed Calculation.

Three things to try, in order:

1. `0.1 + 0.2` returns `0.3`, not `0.30000000000000004`.
2. `1 ÷ 3` comes back marked inexact; `10 ÷ 4` does not.
3. `1 ÷ 0` is refused by name, not rendered as `Infinity` or `NaN`.

The decisions that produce those three answers are below.

## Design decisions

**Arithmetic on the server.** A calculator that evaluates in the browser
inherits JavaScript's binary floating point, where `0.1 + 0.2` is visibly
wrong. Moving evaluation to the API puts Precision behaviour in exactly one
place and makes it observable over the wire. It also makes the honest part
expressible: a Result carries an `exact` flag, and a failure is reported by its
mathematical form, so indeterminate, infinite and imaginary are three different
answers rather than one generic error, a distinction a client-side `NaN` cannot
make. The cost is a network round trip per Calculation, and the front end shows
it: `=` disables while a Calculation is in flight, and a rejection renders the
API's own code and message.

**Decimal, not `float64` or `big.Rat`**
([ADR-0001](docs/adr/0001-decimal-over-rational.md)). `float64` was never a
candidate for a payments company's calculator. `big.Rat` is *more* precise, and
holds `1/3` exactly, but the string a `Rat` prints is not the number it holds:
truncate `1/3` three times for display and the reader sees three values summing
to `0.999` while the system believes they sum to `1`. With a Decimal the
printed string *is* the value, so displayed numbers stay closed under
arithmetic, which is what makes `exact: true` mean something. Precision is 28
significant digits, one value for the whole context.

**One endpoint with a `oneOf`**
([ADR-0002](docs/adr/0002-single-endpoint-with-oneof.md)). A Calculation is a
resource rather than a procedure, so History is a plain `GET /calculations`
instead of a feature bolted onto seven unrelated routes, and adding an
Operation costs one enum value rather than a new path, schema and handler.
Variants rather than a flat `operands: []` make bad arity unrepresentable and
let Operands be named for the role they play, which is what stops `percentage`
from being quietly misread as percent-change or modulo.

**Guarding `shopspring/decimal`.** The library was chosen with its sharp edges
known. Each is contained in `internal/calc` and pinned by a named test:

1. `.Pow` silently degrades to `float64` for a non-integer exponent, returning
   eight significant digits from a 28-digit library. It is banned outright;
   only `PowWithPrecision` is called.
2. `Div` and `DivRound` panic on a zero divisor rather than returning an error,
   so every division site guards its divisor first. This is why `1 ÷ 0` is a
   `422` and not a `500`.
3. `0^0` returns `0` from `.Pow`, `1` from the standard library's `math.Pow`,
   and "cannot represent undefined value" from `PowWithPrecision`. Three
   answers from three places, none of them what a calculator should say, so
   `internal/calc` answers it itself with `undefined_result`.
4. `ExpTaylor` appends to an unsynchronised package-global slice, despite a
   library comment claiming that append is race-free. Every non-integer
   exponent reaches it, so concurrent roots race and a torn read panics. That
   call is serialised behind a mutex, with a context-aware admission gate in
   front so an abandoned request stops waiting instead of holding a slot.

`decimal.DivisionPrecision`, a mutable package-level global, is a fifth trap
avoided by never reading or writing it: every rounding scale is derived from
the `Precision` constant at its call site.

## Scope

- **History is in-memory, single-process, and does not survive a restart.**
  There is no database. History is a convenience, not a ledger.
- **Sessions are bounded and evicted least-recently-used**, 100 Sessions and 50
  Calculations each. An unbounded map keyed by "every browser tab that ever
  loaded the page" reclaims nothing.
- **There is no authentication.** A Session separates one History from another
  and carries nothing else. There are no users and no login.
- **No expression parsing.** A Calculation is one Operation over its Operands.
  There is no precedence and no `2 + 3 × 4`; chaining happens by carrying a
  Result forward explicitly.
- **`percentage` is Percent-of and nothing else**, not percent-change, not
  modulo, and not the context-dependent `%` key of a physical calculator, which
  is a UI behaviour and cannot live in a stateless API.

## API

One path carries all the arithmetic. A Calculation is a resource rather than a
procedure: every Operation posts to it, and History is a plain `GET` of the
same path.

| | |
|---|---|
| `GET /api/health` | Is the API up. |
| `POST /api/calculations` | Perform a Calculation and record it in the Session's History. |
| `GET /api/calculations` | The Session's History, newest first. |

`X-Session-Id` is a required UUID header on both `/calculations` calls. It is
what separates one caller's History from another's and carries no identity
beyond that.

The examples below are verbatim runs against `pnpm dev`; each response is what
the server actually returned.

```sh
API=http://localhost:8080/api
SESSION=3f4a1c22-9f1e-4c8a-9f2e-0f1d2c3b4a59

post() {
  curl -s -X POST "$API/calculations" \
    -H 'Content-Type: application/json' \
    -H "X-Session-Id: $SESSION" \
    -d "$1"
}
```

### Operations

`add`, `subtract`, `multiply`, `divide` and `power` take `left` and `right`;
`sqrt` takes `operand`; `percentage` takes `percent` and `of`. An Operation can
only be sent with the Operands its arity allows, per
[ADR-0002](docs/adr/0002-single-endpoint-with-oneof.md).

```sh
$ curl -s "$API/health"
{"status":"ok"}

$ post '{"operation":"add","left":"0.1","right":"0.2"}'
{"exact":true,"left":"0.1","operation":"add","result":"0.3","right":"0.2"}

$ post '{"operation":"divide","left":"10","right":"4"}'
{"exact":true,"left":"10","operation":"divide","result":"2.5","right":"4"}

# 28 significant digits, and honest about being a truncation of 1/3
$ post '{"operation":"divide","left":"1","right":"3"}'
{"exact":false,"left":"1","operation":"divide","result":"0.3333333333333333333333333333","right":"3"}

$ post '{"operation":"power","left":"2","right":"10"}'
{"exact":true,"left":"2","operation":"power","result":"1024","right":"10"}

$ post '{"operation":"sqrt","operand":"2"}'
{"exact":false,"operand":"2","operation":"sqrt","result":"1.414213562373095048801688724"}

# Percent-of, and only that: 15% of 200
$ post '{"operation":"percentage","percent":"15","of":"200"}'
{"exact":true,"of":"200","operation":"percentage","percent":"15","result":"30"}
```

### History

```sh
$ curl -s "$API/calculations" -H "X-Session-Id: $SESSION"
[{"exact":true,"of":"200","operation":"percentage","percent":"15","result":"30"},
 {"exact":false,"operand":"2","operation":"sqrt","result":"1.414213562373095048801688724"},
 {"exact":true,"left":"2","operation":"power","result":"1024","right":"10"},
 …]
```

### Errors

A failure that is mathematically undefined, infinite, or imaginary is three
different things, not one. Each is a `422` naming its own form. A fifth code
belongs to the contract rather than to arithmetic: the embedded `openapi.yaml`
validates every request, so a bad arity or a missing Session never reaches a
handler.

| Code | Status | Raised by |
|---|---|---|
| `undefined_result` | 422 | `0 ÷ 0` and `0^0`, which are indeterminate |
| `division_by_zero` | 422 | `1 ÷ 0` and `0^-2`, which are infinite |
| `negative_square_root` | 422 | `√-4`, which is imaginary |
| `result_too_large` | 422 | `2^100000`, refused before the computation is attempted |
| `invalid_request` | 400 | A body that does not match the contract, or a missing `X-Session-Id` |

```sh
$ post '{"operation":"divide","left":"1","right":"0"}'      # 422
{"error":"division_by_zero","message":"division by zero"}

$ post '{"operation":"sqrt","operand":"-4"}'                # 422
{"error":"negative_square_root","message":"negative square root"}

$ post '{"operation":"sqrt","left":"1","right":"2"}'        # 400
{"error":"invalid_request","message":"the request body does not match the API contract"}
```

## Tests

```sh
scripts/devcontainer/exec.sh pnpm test                     # go test -race + the browser unit suite
scripts/devcontainer/exec.sh .github/scripts/web-e2e.sh    # Playwright against built assets
```

The backend suite is `go test -race` across `calc`, `httpapi` and `store`. The
frontend has **56 unit tests** running in real Chromium under Vitest browser
mode, and **58 Playwright scenarios** driving the built page against the real
API.

Every pull request runs [`backend.yml`](.github/workflows/backend.yml),
[`frontend.yml`](.github/workflows/frontend.yml) and
[`contract.yml`](.github/workflows/contract.yml), one file per failure kind so
a Go, browser or contract failure is distinguishable without opening a log.
`contract.yml` regenerates from `openapi.yaml` with
`turbo run generate --force` and fails if `gen.go` or `schema.d.ts` moves,
which is what keeps a hand-edited generated file from building green.

## Coverage

Coverage is measured over **hand-written code only**. Four paths are excluded,
and this table is the one place that list is written down; the two configs that
apply it point back here.

| Excluded | Why |
|---|---|
| `apps/api/internal/httpapi/gen.go` | Generated from `openapi.yaml`. |
| `apps/api/cmd/server` | Process entry point: flag parsing, signal handling, `ListenAndServe`. |
| `packages/api-contract/src/schema.d.ts` | Generated from `openapi.yaml`; types only, no statements. |
| `apps/web/src/main.tsx` | Mounts `<App/>` into the DOM and nothing else. |

Both gates fail the build below **90%** of statements. A threshold nothing
exits non-zero on is not a threshold.

```sh
scripts/devcontainer/exec.sh pnpm --filter api test:coverage   # → 94.4%, gate passes
scripts/devcontainer/exec.sh pnpm --filter web test:coverage   # → 100%,  gate passes
```

Backend is at **94.4%** of hand-written statements, frontend at **100%** of
statements and lines. Branches are reported but not gated, for the reason
`apps/web/vite.config.ts` records at the threshold. The Playwright scenarios
run against built, uninstrumented assets and contribute nothing to these
numbers.

## What I'd do next

- **TTL-based Session expiry.** Least-recently-used eviction bounds memory but
  ties a Session's lifetime to how busy the server is, which is the wrong
  variable: a quiet afternoon keeps dead Sessions alive and a busy one discards
  live ones. An idle timeout swept on a ticker expires a Session on its own
  terms.
- **Durable storage.** A `Store` implementation over Postgres or Redis behind
  the existing `store.Store[T]` interface, so History survives a restart and
  the API can run more than one process. Nothing above the interface knows the
  store is a map.

## Extending the API

1. Edit `packages/api-contract/openapi.yaml`.
2. Run `scripts/devcontainer/exec.sh pnpm generate` to regenerate `gen.go` and
   `schema.d.ts`. Commit both; never hand-edit them.
3. Implement the new `ServerInterface` method on `Server` in
   `apps/api/internal/httpapi/`.
4. Consume the typed client from `@sezzle/api-contract` in `apps/web`.

The rules a change is reviewed against are in
[docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md).
