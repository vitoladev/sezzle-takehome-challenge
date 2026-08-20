# Calculator

A calculator whose arithmetic is performed by the server, so that precision
behaviour is defined in one place and is observable over the API rather than
hidden inside a browser's number type. `0.1 + 0.2` returns `"0.3"`, and every
Result says whether it is exact.

- **`apps/web`** — Vite + React (TypeScript). Keypad entry with arity-aware
  Operand fields, an Exactness indicator, and a History panel. Dev server on
  `:5173`, proxying `/api/*` to the backend.
- **`apps/api`** — Go HTTP server on `:8080`, serving the API under `/api/*`.
  Arbitrary-precision decimal arithmetic, contract validation at the edge, and
  an in-memory History per Session.
- **`packages/api-contract`** — contract-first: `openapi.yaml` is the single
  source of truth. `pnpm generate` produces the Go server interfaces
  (`apps/api/internal/httpapi/gen.go` via oapi-codegen) and the TypeScript types
  and client (`src/schema.d.ts` via openapi-typescript / openapi-fetch). Both are
  committed and never hand-edited.

The domain vocabulary these documents use — Calculation, Operation, Operand,
Result, Exactness, Precision, Session, History — is defined in
[CONTEXT.md](CONTEXT.md).

## Setup

Development happens **inside a devcontainer** — the host machine needs no Node,
pnpm, or Go toolchain. You need:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**
- **[devcontainer CLI](https://github.com/devcontainers/cli)** (`brew install devcontainer`)
- **git**

```sh
scripts/devcontainer/up.sh    # build + start the container, install deps
```

## Running

One command brings the whole stack up:

```sh
scripts/devcontainer/exec.sh pnpm dev    # web on :5173, api on :8080
```

Open **http://localhost:5173**. The header carries a health lamp fed by
`GET /api/health`, so a backend that is not running is visible rather than
silently inferred from a failed Calculation.

## API

One path carries all the arithmetic. A Calculation is a resource rather than a
procedure: every Operation posts to it, and History is a plain `GET` of the same
path.

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

### Health

```sh
$ curl -s "$API/health"
{"status":"ok"}
```

### The seven Operations

`add`, `subtract`, `multiply`, `divide` and `power` take `left` and `right`;
`sqrt` takes `operand`; `percentage` takes `percent` and `of`. An Operation can
only be sent with the Operands its arity allows — see
[ADR-0002](docs/adr/0002-single-endpoint-with-oneof.md).

```sh
$ post '{"operation":"add","left":"0.1","right":"0.2"}'
{"exact":true,"left":"0.1","operation":"add","result":"0.3","right":"0.2"}

$ post '{"operation":"subtract","left":"2","right":"2"}'
{"exact":true,"left":"2","operation":"subtract","result":"0","right":"2"}

$ post '{"operation":"multiply","left":"1.5","right":"4"}'
{"exact":true,"left":"1.5","operation":"multiply","result":"6","right":"4"}

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

### The four error forms

A failure that is mathematically undefined, infinite, or imaginary is three
different things, not one. Each is a `422` naming its own form.

```sh
# undefined_result — 0 ÷ 0 and 0^0 are indeterminate
$ post '{"operation":"divide","left":"0","right":"0"}'      # 422
{"error":"undefined_result","message":"undefined result"}
$ post '{"operation":"power","left":"0","right":"0"}'       # 422
{"error":"undefined_result","message":"undefined result"}

# division_by_zero — 1 ÷ 0 and 0^-2 are infinite
$ post '{"operation":"divide","left":"1","right":"0"}'      # 422
{"error":"division_by_zero","message":"division by zero"}
$ post '{"operation":"power","left":"0","right":"-2"}'      # 422
{"error":"division_by_zero","message":"division by zero"}

# negative_square_root — √-4 is imaginary
$ post '{"operation":"sqrt","operand":"-4"}'                # 422
{"error":"negative_square_root","message":"negative square root"}

# result_too_large — refused before the computation is attempted
$ post '{"operation":"power","left":"2","right":"100000"}'  # 422
{"error":"result_too_large","message":"result too large"}
```

A fifth code, `invalid_request`, is a `400` and belongs to the contract rather
than to arithmetic: the embedded `openapi.yaml` validates every request before a
handler runs, so a bad arity or a missing Session never reaches one.

```sh
$ post '{"operation":"sqrt","left":"1","right":"2"}'        # 400
{"error":"invalid_request","message":"the request body does not match the API contract"}

$ curl -s -X POST "$API/calculations" -H 'Content-Type: application/json' \
    -d '{"operation":"add","left":"1","right":"2"}'         # 400
{"error":"invalid_request","message":"the X-Session-Id header is missing or malformed"}
```

## Tests

```sh
scripts/devcontainer/exec.sh pnpm test                     # go test -race + the browser unit suite
scripts/devcontainer/exec.sh .github/scripts/web-e2e.sh    # Playwright against built assets
```

The backend suite is `go test -race` across `calc`, `httpapi` and `store`. The
frontend has **56 unit tests** running in real Chromium under Vitest browser
mode, and **57 Playwright scenarios** driving the built page against the real
API. Both jobs run on every pull request —
[`.github/workflows/backend.yml`](.github/workflows/backend.yml) and
[`.github/workflows/frontend.yml`](.github/workflows/frontend.yml), two files so
that a Go failure and a browser failure are distinguishable at a glance.

## Coverage

Coverage is measured over **hand-written code only**. Four paths are excluded,
and this list is the one place it is written down — the two configs that apply
it point back here:

| Excluded | Why |
|---|---|
| `apps/api/internal/httpapi/gen.go` | Generated from `openapi.yaml`. |
| `apps/api/cmd/server` | Process entry point: flag parsing, signal handling, `ListenAndServe`. |
| `packages/api-contract/src/schema.d.ts` | Generated from `openapi.yaml`; types only, no statements. |
| `apps/web/src/main.tsx` | Mounts `<App/>` into the DOM and nothing else. |

Both gates fail the build below **90%** of statements. They are not advisory
reports: a threshold nothing exits non-zero on is not a threshold.

```sh
scripts/devcontainer/exec.sh pnpm --filter api test:coverage   # → 94.6%, gate passes
scripts/devcontainer/exec.sh pnpm --filter web test:coverage   # → 100%,  gate passes
```

Backend, as of this commit: **94.6%** of hand-written statements overall —
`internal/calc` at 94.2%, `internal/httpapi` and `internal/store` together at
95.7%.

Frontend, as of this commit: **100%** of statements and lines, 98.4% of
branches. The 57 Playwright scenarios run against built, uninstrumented assets
and so contribute nothing to this number — every line counted above is reached
by the unit suite in its own right. Branches are reported but not gated, for the
reason `apps/web/vite.config.ts` records at the threshold.

## Design rationale

### Why the arithmetic is on the server

A calculator that evaluates in the browser inherits JavaScript's binary floating
point, where `0.1 + 0.2` is visibly wrong. Moving evaluation to the API puts
Precision behaviour in exactly one place and makes it observable over the wire:
the browser never computes, so it cannot disagree with the server about what a
number is. It also makes the honest part expressible. A Result carries an
`exact` flag, and a failure is reported by its mathematical form —
indeterminate, infinite, or imaginary are three different answers, not one
generic error — which is a distinction a client-side `NaN` cannot make.

The cost is a network round trip per Calculation, and the front end is built to
show it: `=` disables while a Calculation is in flight, and a rejection renders
the API's own code and message.

### Why decimal, not `float64` or `big.Rat`

`float64` was never a candidate for a payments company's calculator. The choice
worth recording was between `math/big.Rat` and `shopspring/decimal`, and it is
recorded in [ADR-0001](docs/adr/0001-decimal-over-rational.md).

Briefly: `big.Rat` is *more* precise — it holds `1/3` exactly and never rounds a
division — but the string a `Rat` prints is not the number it holds. Truncate
`1/3` three times for display and the reader sees three values summing to
`0.999` while the system believes they sum to `1`. With a Decimal the printed
string *is* the value, so displayed numbers stay closed under arithmetic. That
property is what makes `exact: true` mean something rather than "exact in
memory, but not in the string I just sent you". Precision is 28 significant
digits, one value for the whole context.

### Why one endpoint with a `oneOf`

Every Operation posts to `POST /calculations`, whose body is a `oneOf` of three
variants discriminated on `operation`. The reasoning is in
[ADR-0002](docs/adr/0002-single-endpoint-with-oneof.md): a Calculation is a
resource rather than a procedure, so History is a plain `GET /calculations`
instead of a feature bolted onto seven unrelated routes, and adding an Operation
costs one enum value rather than a new path, schema, and handler. Variants
rather than a flat `operands: []` make bad arity unrepresentable — there is no
way to express `sqrt` with two Operands in a request that validates — and let
Operands be named for the role they play, which is what stops `percentage` from
being quietly misread as percent-change or modulo.

### The four hazards in `shopspring/decimal`

The library was chosen with its sharp edges known. Each is contained in
`internal/calc` and pinned by a named test:

1. **`.Pow` silently degrades to `float64`** for a non-integer exponent —
   `2^0.5` comes back with eight significant digits from a 28-digit library. It
   is banned outright; only `PowWithPrecision` is called.
2. **`Div` and `DivRound` panic on a zero divisor** rather than returning an
   error, so every division site guards its divisor first. This is why
   `1 ÷ 0` is a `422` and not a `500`.
3. **`0^0` returns `0`** from `.Pow`, disagreeing with the standard library's
   `math.Pow`, which returns `1` — and with `PowWithPrecision`, which reports
   "cannot represent undefined value". Three answers from three places, none of
   them what a calculator should say: `0^0` is an indeterminate form, so
   `internal/calc` answers it itself with `undefined_result`.
4. **`ExpTaylor` appends to an unsynchronised package-global `factorials`
   slice**, despite a library comment claiming that append is race-free. Every
   non-integer exponent reaches it through `PowWithPrecision`, so concurrent
   roots race on the slice and a torn read of its header panics with an
   index-out-of-range. That one call is serialised behind a mutex; the integer
   path returns before the series and stays unserialised. Because a mutex queue
   cannot be left when its caller disconnects, the HTTP layer puts a
   context-aware admission gate in front of it, so an abandoned request stops
   waiting instead of holding a slot.

`decimal.DivisionPrecision` — a mutable package-level global — is a fifth trap
avoided by never reading or writing it: every rounding scale is derived from the
`Precision` constant at its call site.

## What this deliberately does not do

- **History is in-memory, single-process, and does not survive a restart.**
  There is no database. Restart the API and every Session's History is gone.
  History is a convenience, not a ledger.
- **Sessions are bounded and evicted least-recently-used.** The store keeps 100
  Sessions and 50 Calculations each. Past that, the least recently used Session
  is dropped whole — its entire History with it — because an unbounded map keyed
  by "every browser tab that ever loaded the page" reclaims nothing.
- **There is no authentication.** A Session separates one History from another
  and carries nothing else. Anyone holding a Session's UUID can read its
  History; there are no users, no login, and nothing to authenticate.
- **No expression parsing.** A Calculation is one Operation over its Operands.
  There is no precedence and no `2 + 3 × 4`; chaining happens by carrying a
  Result forward explicitly. Left-to-right evaluation of a typed expression
  would be wrong, and a parser is a different problem.
- **`percentage` is Percent-of and nothing else** — not percent-change, not
  modulo, not the context-dependent `%` key of a physical calculator, which is a
  UI behaviour and cannot live in a stateless API.

## What I'd do next

- **TTL-based Session expiry.** Least-recently-used eviction bounds memory but
  ties a Session's lifetime to how busy the server is, which is the wrong
  variable: a quiet afternoon keeps dead Sessions alive and a busy one discards
  live ones. An idle timeout swept on a ticker expires a Session on its own
  terms.
- **Durable storage.** A `Store` implementation over Postgres or Redis behind
  the existing `store.Store[T]` interface, so History survives a restart and the
  API can run more than one process. The interface was drawn with that in mind;
  nothing above it knows the store is a map.

## Extending the API

1. Edit `packages/api-contract/openapi.yaml`.
2. `scripts/devcontainer/exec.sh pnpm generate` — regenerates `gen.go` and
   `schema.d.ts` (commit both; never hand-edit them).
3. Implement the new `ServerInterface` method on `Server` in
   `apps/api/internal/httpapi/`.
4. Consume the typed client from `@sezzle/api-contract` in `apps/web`.

The rules a change is reviewed against are in
[docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md).
