# One `/calculations` endpoint with an arity-discriminated `oneOf`

Every Operation posts to a single `POST /calculations`, whose body is a
`oneOf` of three variants discriminated on `operation`: `BinaryCalculation`
(`left`, `right`), `UnaryCalculation` (`operand`), and
`PercentageCalculation` (`percent`, `of`). The alternatives were one endpoint
per Operation, and a flat `{ operation, operands: [] }` body.

## Why one endpoint

A Calculation is a resource, not a procedure. Modelling it as one makes
History a plain `GET /calculations` rather than a feature bolted onto seven
unrelated routes, and adding an Operation costs one enum value instead of a
new path, schema, and handler.

## Why variants rather than a flat operand array

Because a flat `operands: []` can only reject bad arity at runtime, while
variants make it unrepresentable: there is no way to express `sqrt` with two
Operands in a request that validates. It also lets Operands be named for the
role they play — `percent` and `of` rather than `left` and `right` — which is
what stops the `percentage` Operation from being quietly misread as
percent-change or modulo.

## Consequences

`oapi-codegen` renders a `oneOf` as a struct wrapping `json.RawMessage` with
`AsBinaryCalculation()` / `FromUnaryCalculation()` accessors and a
`Discriminator()` method — not a Go interface. Handlers pay for the safety
with an explicit discriminator switch. Adding an Operation that needs a new
Operand shape means a fourth variant, which is a breaking contract change
under GEN-3; adding one that fits an existing shape does not.
