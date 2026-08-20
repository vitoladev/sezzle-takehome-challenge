# Calculator

A calculator whose arithmetic is performed by the server, so that precision
behaviour is defined in one place and is observable over the API rather than
hidden inside a browser's number type.

## Language

### Arithmetic

**Calculation**:
One Operation applied to its Operands, producing one Result. A Calculation is
self-contained and immutable — it never depends on a Calculation that came
before it.
_Avoid_: Computation, expression, equation, sum

**Operation**:
The named arithmetic function a Calculation applies: `add`, `subtract`,
`multiply`, `divide`, `power`, `sqrt`, `percentage`. Each Operation fixes how
many Operands it takes.
_Avoid_: Operator, function, action, command

**Operand**:
An input value to a Calculation. Operands are named by the role they play —
`left`/`right`, `operand`, or `percent`/`of` — never by position.
_Avoid_: Argument, input, term, parameter

**Result**:
The value a Calculation produces, in its shortest form that discards no
digits. A Result is always reported together with its Exactness.
_Avoid_: Answer, output, total

**Percent-of**:
The meaning of the `percentage` Operation: what share of one value another
value's percentage represents — `percentage(15, 200)` is `30`. Deliberately
not percent-change, not modulo, and not the context-dependent `%` key of a
physical calculator.
_Avoid_: Percent, percentage change, modulo, remainder

### Precision

**Exactness**:
Whether a Result carries its true mathematical value with no digits discarded.
`10 ÷ 4` is exact; `1 ÷ 3` and `√2` are not. Exactness is reported to the
caller, never left to be inferred from how the digits look.
_Avoid_: Accuracy, rounded, approximate, precise

**Precision**:
How many significant digits a Result keeps when it cannot be exact. One value
governs the entire context — no Operation sets its own.
_Avoid_: Scale, decimal places, rounding, tolerance

**Undefined result**:
An outcome that is mathematically indeterminate — `0 ÷ 0` and `0^0`. Distinct
from an outcome that is infinite (`1 ÷ 0`, `0^-2`) and from one that is
imaginary (`√-4`); each of the three is reported differently.
_Avoid_: NaN, invalid, impossible, error

### Record-keeping

**Session**:
The scope that owns one History, isolating one caller's Calculations from
every other caller's. A Session carries no identity beyond that separation:
there is no user behind it, no login, and nothing to authenticate.
_Avoid_: User, account, client, visitor, tenant

**History**:
The Calculations a Session has performed, newest first, and bounded — the
oldest is discarded once the bound is reached. History is a convenience, not a
ledger: it is never edited, and losing it loses nothing but convenience.
_Avoid_: Log, ledger, audit trail, tape, journal
