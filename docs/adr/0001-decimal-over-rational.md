# Arbitrary-precision decimal, not rational or float64

Operands and Results are carried as decimal strings and computed with
`shopspring/decimal`, not with `float64` and not with the standard library's
`math/big.Rat`. A calculator built for a payments company that prints
`0.1 + 0.2 = 0.30000000000000004` has failed at the one thing it was asked to
do, so `float64` was never a candidate. The choice between decimal and
rational is the one worth recording.

## Considered options

**`math/big.Rat` (standard library).** Measured, not assumed: `big.Rat` gives
`0.1 + 0.2 == 0.3` exactly and holds `1/3` as an exact rational, making it
*more* precise than any base-10 decimal library — division never rounds. Zero
dependencies. It has no `Sqrt`, so irrational Results would drop to
`big.Float`, giving the context two numeric types.

**`shopspring/decimal` (chosen).** Base-10 throughout, one numeric type, one
dependency. Division rounds at a configured Precision.

## Why decimal won despite being less precise

Because the string a `Rat` prints is not the number it holds. Truncate
`1/3`, `1/3`, `1/3` to three digits for display and the reader sees three
values that sum to `0.999` while the system believes they sum to `1`. With a
Decimal, the printed string *is* the value, so displayed numbers stay closed
under arithmetic. That property is why decimal is the standard for money, and
it is what makes the `exact` flag on every Result meaningful rather than
decorative: under `big.Rat`, `exact: true` would have meant "exact in memory,
but not in the string I just sent you."

## Consequences

Three behaviours of the chosen library are hazards rather than conveniences,
each pinned by a named test:

- `.Pow` silently degrades to `float64` for non-integer exponents — `2^0.5`
  returns eight significant digits. It is banned; only `PowWithPrecision` is
  used.
- `Div` and `DivRound` **panic** on a zero divisor rather than returning an
  error, so every division site guards first.
- `decimal.DivisionPrecision` is a mutable package-level global. It is never
  written; Precision is our own constant, passed explicitly at every call.
