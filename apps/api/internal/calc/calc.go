// Package calc evaluates a Calculation — one Operation over its Operands — in
// arbitrary-precision decimal and reports the Exactness of every Result. It is
// pure arithmetic: nothing from net/http, nothing generated, no store.
//
// The four hazards of shopspring/decimal recorded in
// docs/adr/0001-decimal-over-rational.md are contained here: every division
// guards its divisor first, only PowWithPrecision is called, every rounding
// scale is derived from Precision at the call site, and the one call that
// reaches the series is serialised.
//
// The library rounds at a decimal place while Precision counts significant
// digits, so each scale is derived from the magnitude of the value being
// rounded: rounding √1e-60 at 28 places would report 1e-30 as zero.
//
// Every Operation assumes Operands inside the magnitude bound magnitudePastCap
// draws; the contract's Operand pattern, which forbids exponent notation, and
// its maxLength of 50 are what guarantee that for every caller reached over the
// wire. A direct caller constructing a synthetic out-of-band value —
// decimal.New(1, -1000000000) — is outside that precondition: Divide, Power, and
// Sqrt refuse it with ErrResultTooLarge at their public entry, while Add and
// Subtract hang inside the library's own rescaling and Multiply, and so
// Percentage, panics on a product whose exponent overflows an int32. The
// refusal sits at that entry and nowhere below it: an intermediate a capped
// Operation formed for itself is bounded by construction, so re-judging it
// would refuse Results the bound admits.
package calc

import (
	"math"
	"math/big"
	"sync"

	"github.com/shopspring/decimal"
)

// Precision is how many significant digits a Result keeps when it cannot be
// exact. One value governs the whole context; no Operation sets its own.
const Precision = 28

// exponentCap is the largest exponent evaluated, in either direction.
const exponentCap = 1000

// rootGuardDigits are the extra decimal places a root is computed with. They
// absorb the tail PowWithPrecision leaves unrounded and the slack in the
// magnitude estimate that sets the scale.
const rootGuardDigits = 8

var (
	one  = decimal.NewFromInt(1)
	half = decimal.New(5, -1)
	// An exponent past this is refused before evaluation: 2^1000000 succeeds
	// unguarded and produces a 301,030-digit number.
	maxExponent = decimal.NewFromInt(exponentCap)

	powMu sync.Mutex
)

// Result is the value a Calculation produced together with its Exactness.
// Value.String() renders it in the shortest form that discards no digits.
type Result struct {
	Value decimal.Decimal
	Exact bool
}

// Add, Subtract, and Multiply cannot round: every decimal sum, difference, and
// product is representable in decimal, so their Results are always exact.
func Add(left, right decimal.Decimal) Result {
	return Result{Value: left.Add(right), Exact: true}
}

func Subtract(left, right decimal.Decimal) Result {
	return Result{Value: left.Sub(right), Exact: true}
}

func Multiply(left, right decimal.Decimal) Result {
	return Result{Value: left.Mul(right), Exact: true}
}

// Divide is the public entry to division: it refuses an Operand past the
// magnitude cap, because DivRound overflows in QuoRem on a magnitude that far
// out rather than returning an error.
func Divide(dividend, divisor decimal.Decimal) (Result, error) {
	// Ahead of the zero-divisor guard for the same reason Power's cap runs
	// ahead of its zero-base guards: a refusal about the size of the Result
	// costs a comparison, and the arithmetic below it does not.
	if magnitudePastCap(dividend) || magnitudePastCap(divisor) {
		return Result{}, ErrResultTooLarge
	}
	return divide(dividend, divisor)
}

// divide is the division itself, on operands the caller has already established
// are inside the magnitude bound — either because Divide just checked them, or
// because Power capped its base and its exponent before raising, which bounds
// the reciprocal's intermediate to 1e1000000 and so keeps probeScale far inside
// an int32. Power divides through here rather than through Divide so that
// intermediate is not judged against a cap that speaks about Operands: 1e49^1000
// is past the cap and 1e49^-1000 is a Calculation nothing asks to be refused.
//
// It guards the zero divisor first, because DivRound panics on zero rather than
// returning an error.
func divide(dividend, divisor decimal.Decimal) (Result, error) {
	if divisor.IsZero() {
		if dividend.IsZero() {
			return Result{}, ErrUndefinedResult
		}
		return Result{}, ErrDivisionByZero
	}
	probe := dividend.DivRound(divisor, probeScale(dividend, divisor))
	if probe.Mul(divisor).Equal(dividend) {
		// A quotient that terminates is reported whole: Precision governs a
		// Result only when it cannot be exact.
		return Result{Value: probe, Exact: true}, nil
	}
	// Divide again rather than round the probe: rounding a rounded quotient can
	// carry its last digit further than the quotient itself does.
	return Result{Value: dividend.DivRound(divisor, precisionScale(probe)), Exact: false}, nil
}

// probeScale is a number of decimal places generous enough for two jobs: it
// exposes a quotient that terminates, and it carries more than Precision
// significant digits of one that does not, so the magnitude the Result rounds
// at can be read off it.
func probeScale(dividend, divisor decimal.Decimal) int32 {
	significant := Precision + 2 - adjustedExponent(dividend) + adjustedExponent(divisor)
	// A terminating quotient's last place is bounded by the divisor's digits:
	// 1/2^n ends after n places, and 2^n is longer than a quarter of n digits.
	terminating := 4*int32(divisor.NumDigits()) - dividend.Exponent() + divisor.Exponent()
	return max(significant, terminating)
}

// Power answers the undefined, infinite, and imaginary cases itself instead of
// passing the library's answers through.
func Power(base, exponent decimal.Decimal) (Result, error) {
	// The constant-time guards come first because the exact comparison is not
	// affordable on every input: comparing two Decimals rescales both to a
	// common exponent, so an exponent of 1e-1000000000 builds 10^1000000000 —
	// hundreds of megabytes, minutes — inside the check meant to refuse it.
	if magnitudePastCap(exponent) || magnitudePastCap(base) ||
		exponent.Abs().GreaterThan(maxExponent) {
		return Result{}, ErrResultTooLarge
	}
	if base.IsZero() {
		switch {
		case exponent.IsZero():
			// Deliberate disagreement: .Pow answers 0, PowWithPrecision reports
			// "cannot represent undefined value", and math.Pow(0, 0) answers 1.
			// 0^0 is an indeterminate form, so no answer is reported at all.
			return Result{}, ErrUndefinedResult
		case exponent.IsNegative():
			return Result{}, ErrDivisionByZero
		}
		return Result{Value: decimal.Zero, Exact: true}, nil
	}
	if base.IsNegative() && !exponent.IsInteger() {
		return Result{}, ErrNegativeSquareRoot
	}

	value, exact, err := raise(base, exponent.Abs())
	if err != nil {
		return Result{}, err
	}
	if exponent.IsNegative() {
		// A negative exponent is a reciprocal, so division owns the quotient's
		// rounding and its Exactness witness. Raising by the positive exponent
		// first also keeps the magnitude away from PowWithPrecision, which
		// rounds at a decimal place and would return 1e20^-2.5 as zero.
		quotient, err := divide(one, value)
		if err != nil {
			return Result{}, err
		}
		return Result{Value: quotient.Value, Exact: exact && quotient.Exact}, nil
	}
	if exact {
		return Result{Value: value, Exact: true}, nil
	}
	return Result{Value: value.Round(precisionScale(value)), Exact: false}, nil
}

// raise evaluates a nonzero base to a non-negative exponent — Power has already
// refused a negative base under a fractional one — and reports whether the
// value it returns is the true one. That value is rounded only when
// rounding discards nothing: an inexact root keeps the guard digits
// PowWithPrecision computed, so that dividing by it — which Power does for a
// negative exponent — does not carry this rounding into the quotient.
func raise(base, exponent decimal.Decimal) (decimal.Decimal, bool, error) {
	if exponent.IsInteger() {
		// A whole-number power is computed exactly; rounding it would discard
		// digits — 0.5^100 has a hundred of them.
		value, err := base.PowWithPrecision(exponent, Precision)
		return value, true, err
	}
	value, err := powSeries(base, exponent, rootScale(base, exponent))
	if err != nil {
		return decimal.Zero, false, err
	}
	// PowWithPrecision returns guard digits it does not round away, and their
	// tail is not correct, so an exact root is the rounding of what it returned.
	rounded := value.Round(precisionScale(value))
	if rootIsExact(base, exponent, rounded) {
		return rounded, true, nil
	}
	return value, false, nil
}

// powSeries is PowWithPrecision on the path that evaluates a series, held under
// a mutex because decimal v1.4.0 caches factorials in an unsynchronised
// package-level slice that ExpTaylor appends to — despite a comment there
// claiming the append is race-free. Concurrent roots race on it and a torn read
// of the slice header panics with an out-of-range index. Only this call is
// serialised: an integer exponent returns from PowWithPrecision before the
// series, so raise's whole-number path is repeated multiplication and safe.
func powSeries(base, exponent decimal.Decimal, places int32) (decimal.Decimal, error) {
	powMu.Lock()
	defer powMu.Unlock()
	return base.PowWithPrecision(exponent, places)
}

// rootScale is how many decimal places PowWithPrecision has to carry for a root
// to hold Precision significant digits. It raises by the whole part of the
// exponent exactly and computes only the fractional part by series, so the
// places to pay for are those of base^frac: √1e-60 has thirty leading zeros
// before the digits it keeps begin.
func rootScale(base, exponent decimal.Decimal) int32 {
	fraction := exponent.Sub(exponent.Truncate(0))
	magnitude := fraction.InexactFloat64() * log10(base)
	if magnitude >= 0 {
		return Precision + rootGuardDigits
	}
	return Precision + rootGuardDigits + int32(math.Ceil(-magnitude))
}

// Sqrt is Power with an exponent of one half, so the root goes through
// PowWithPrecision and reports its Exactness by the same witness.
func Sqrt(operand decimal.Decimal) (Result, error) {
	return Power(operand, half)
}

// Percentage is Percent-of: the share of `of` that the `percent` percentage
// represents. Dividing by a hundred is a decimal-point shift in base 10, so the
// Result never rounds and never reaches the zero-divisor path.
func Percentage(percent, of decimal.Decimal) Result {
	return Result{Value: percent.Mul(of).Shift(-2), Exact: true}
}

// A non-integer exponent asks for a root, which is exact only when raising the
// Result back reproduces the base. The exponent is a finite decimal and so a
// ratio p/q of whole numbers, and value^q == base^p is that witness. Both
// powers answer to the same cap as any exponent — witnessing 2^0.0000000001
// would ask for a ten-billion-fold power, the computation the cap exists to
// refuse — so a root whose witness is unaffordable is reported inexact.
func rootIsExact(base, exponent, value decimal.Decimal) bool {
	p, q, ok := lowestTerms(exponent)
	if !ok {
		return false
	}
	raised, err := value.PowInt32(q)
	if err != nil {
		return false
	}
	reproduced, err := base.PowInt32(p)
	if err != nil {
		return false
	}
	return raised.Equal(reproduced)
}

// lowestTerms reduces a positive non-integer exponent to p/q, reporting whether
// both stay inside the cap.
func lowestTerms(exponent decimal.Decimal) (p, q int32, ok bool) {
	places := -exponent.Exponent()
	// q divides 10^places and stays under the cap only if all but the cap's own
	// digits cancel against the coefficient, so a coefficient this short cannot
	// yield a witness and 10^places is not worth building to find that out.
	if places > int32(exponent.NumDigits())+4 {
		return 0, 0, false
	}
	numerator := exponent.Coefficient()
	denominator := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(places)), nil)
	common := new(big.Int).GCD(nil, nil, numerator, denominator)
	numerator.Div(numerator, common)
	denominator.Div(denominator, common)
	if !numerator.IsInt64() || !denominator.IsInt64() ||
		numerator.Int64() > exponentCap || denominator.Int64() > exponentCap {
		return 0, 0, false
	}
	return int32(numerator.Int64()), int32(denominator.Int64()), true
}

// magnitudePastCap reports whether a value sits further from one than the cap
// admits, reading nothing but the exponent field and the digit count. It refuses
// the operands the exact comparison and the series could not afford to reach: an
// exponent of 1e-1000000000 asks for a root of order 10^1000000000, √1e-1000000000
// has five hundred million leading zeros, and (1e-1000000000)^3 does not exist at
// all — the library panics because the product's exponent overflows an int32. All
// three are refused as ErrResultTooLarge rather than as a form of their own,
// because what is unaffordable about them is the size of the Result they ask for.
// A magnitude inside the band still reaches the exact comparison, which costs
// microseconds there.
func magnitudePastCap(d decimal.Decimal) bool {
	// Zero has no magnitude, and x^0 is 1 however that zero is scaled.
	if d.IsZero() {
		return false
	}
	ae := adjustedExponent(d)
	return ae > exponentCap || ae < -exponentCap
}

// precisionScale is the decimal place a value of this magnitude reaches after
// Precision significant digits.
func precisionScale(d decimal.Decimal) int32 {
	return Precision - 1 - adjustedExponent(d)
}

// adjustedExponent is the base-10 exponent of a value's leading digit: d is
// m × 10^adjustedExponent for a mantissa m with one digit before its point.
func adjustedExponent(d decimal.Decimal) int32 {
	return d.Exponent() + int32(d.NumDigits()) - 1
}

// log10 is the base-10 logarithm of a nonzero value, read off the exponent of
// its leading digit and the mantissa that digit scales. Only the magnitude it
// implies is used, so float64 is precise enough.
func log10(d decimal.Decimal) float64 {
	mantissa := d.Abs().Shift(-adjustedExponent(d)) // 1 ≤ mantissa < 10
	return float64(adjustedExponent(d)) + math.Log10(mantissa.InexactFloat64())
}
