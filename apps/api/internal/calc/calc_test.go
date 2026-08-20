package calc

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

// sqrtTwo is √2 = 1.41421356237309504880168872420969807856967... kept to
// Precision significant digits.
const sqrtTwo = "1.414213562373095048801688724"

func TestEvaluations(t *testing.T) {
	tests := []struct {
		name  string
		eval  func() (Result, error)
		want  string
		exact bool
	}{
		{
			name:  "add: 0.1 + 0.2 is 0.3, not a binary-float artifact",
			eval:  func() (Result, error) { return Add(dec("0.1"), dec("0.2")), nil },
			want:  "0.3",
			exact: true,
		},
		{
			name:  "add: 2 + 2 is 4, not 4.0000000000",
			eval:  func() (Result, error) { return Add(dec("2"), dec("2")), nil },
			want:  "4",
			exact: true,
		},
		{
			name:  "subtract: 0.3 - 0.1 is 0.2",
			eval:  func() (Result, error) { return Subtract(dec("0.3"), dec("0.1")), nil },
			want:  "0.2",
			exact: true,
		},
		{
			name:  "multiply: 1.1 * 1.1 is 1.21",
			eval:  func() (Result, error) { return Multiply(dec("1.1"), dec("1.1")), nil },
			want:  "1.21",
			exact: true,
		},
		{
			name:  "divide: 10 / 4 is 2.5 and exact",
			eval:  func() (Result, error) { return Divide(dec("10"), dec("4")) },
			want:  "2.5",
			exact: true,
		},
		{
			name:  "divide: 1 / 3 keeps Precision digits and is inexact",
			eval:  func() (Result, error) { return Divide(dec("1"), dec("3")) },
			want:  "0.3333333333333333333333333333",
			exact: false,
		},
		{
			name:  "divide: -1 / 3 rounds away from zero and is inexact",
			eval:  func() (Result, error) { return Divide(dec("-1"), dec("3")) },
			want:  "-0.3333333333333333333333333333",
			exact: false,
		},
		{
			name:  "divide: 100 / 3 keeps Precision significant digits, not Precision decimal places",
			eval:  func() (Result, error) { return Divide(dec("100"), dec("3")) },
			want:  "33." + strings.Repeat("3", Precision-2),
			exact: false,
		},
		{
			// 1000/7 = 142.857142857142857142857142857142..., whose Precision-th
			// significant digit rounds up.
			name:  "divide: 1000 / 7 rounds its last kept digit away from zero",
			eval:  func() (Result, error) { return Divide(dec("1000"), dec("7")) },
			want:  "142.8571428571428571428571429",
			exact: false,
		},
		{
			name:  "divide: 1 / 300 counts its digits from the first significant one",
			eval:  func() (Result, error) { return Divide(dec("1"), dec("300")) },
			want:  "0.00" + strings.Repeat("3", Precision),
			exact: false,
		},
		{
			// 1e-30 ÷ 3 is 3.33...e-31: rounded at Precision decimal places it
			// would be reported as zero.
			name:  "divide: a Result far below one keeps its magnitude and its digits",
			eval:  func() (Result, error) { return Divide(dec("1e-30"), dec("3")) },
			want:  "0." + strings.Repeat("0", 30) + strings.Repeat("3", Precision),
			exact: false,
		},
		{
			name:  "divide: the same Result reached through a divisor far above one",
			eval:  func() (Result, error) { return Divide(dec("1"), dec("3e30")) },
			want:  "0." + strings.Repeat("0", 30) + strings.Repeat("3", Precision),
			exact: false,
		},
		{
			name:  "divide: 1 / 1024 terminates after ten places, so all ten are kept",
			eval:  func() (Result, error) { return Divide(dec("1"), dec("1024")) },
			want:  "0.0009765625",
			exact: true,
		},
		{
			// An exact quotient is not cut back to Precision: the constant
			// governs a Result only when it cannot be exact.
			name:  "divide: a 29-digit exact quotient keeps all 29 of its digits",
			eval:  func() (Result, error) { return Divide(dec("12345678901234567890123456789"), dec("1")) },
			want:  "12345678901234567890123456789",
			exact: true,
		},
		{
			name:  "power: 2^10 is 1024 and exact",
			eval:  func() (Result, error) { return Power(dec("2"), dec("10")) },
			want:  "1024",
			exact: true,
		},
		{
			name:  "power: x^0 is 1",
			eval:  func() (Result, error) { return Power(dec("-5.5"), dec("0")) },
			want:  "1",
			exact: true,
		},
		{
			name:  "power: (-2)^3 is -8",
			eval:  func() (Result, error) { return Power(dec("-2"), dec("3")) },
			want:  "-8",
			exact: true,
		},
		{
			name:  "power: 0.1^30 keeps all thirty digits an exact whole-number power has",
			eval:  func() (Result, error) { return Power(dec("0.1"), dec("30")) },
			want:  "0.000000000000000000000000000001",
			exact: true,
		},
		{
			name:  "power: 2^-3 is the exact reciprocal 0.125",
			eval:  func() (Result, error) { return Power(dec("2"), dec("-3")) },
			want:  "0.125",
			exact: true,
		},
		{
			name:  "power: 3^-1 rounds at Precision and is inexact",
			eval:  func() (Result, error) { return Power(dec("3"), dec("-1")) },
			want:  "0.3333333333333333333333333333",
			exact: false,
		},
		{
			name:  "power: 2^0.5 agrees with sqrt and is inexact",
			eval:  func() (Result, error) { return Power(dec("2"), dec("0.5")) },
			want:  sqrtTwo,
			exact: false,
		},
		{
			// 2.5 in lowest terms is 5/2, so the witness is 32^2 == 4^5.
			name:  "power: 4^2.5 is exactly 32, so no digits are discarded",
			eval:  func() (Result, error) { return Power(dec("4"), dec("2.5")) },
			want:  "32",
			exact: true,
		},
		{
			name:  "power: 1^0.3 is exactly 1, though 0.3 has no whole reciprocal",
			eval:  func() (Result, error) { return Power(dec("1"), dec("0.3")) },
			want:  "1",
			exact: true,
		},
		{
			name:  "power: 100^1.5 is exactly 1000",
			eval:  func() (Result, error) { return Power(dec("100"), dec("1.5")) },
			want:  "1000",
			exact: true,
		},
		{
			name:  "power: 0^0.5 is 0 and exact",
			eval:  func() (Result, error) { return Power(dec("0"), dec("0.5")) },
			want:  "0",
			exact: true,
		},
		{
			// The reciprocal is taken after the root, so the Result keeps its
			// magnitude: PowWithPrecision would round 1e-50 away at any scale
			// derived from Precision alone.
			name:  "power: 1e20^-2.5 is the exact reciprocal 1e-50, not zero",
			eval:  func() (Result, error) { return Power(dec("1e20"), dec("-2.5")) },
			want:  "0." + strings.Repeat("0", 49) + "1",
			exact: true,
		},
		{
			name:  "power: 2^-0.5 is the inexact reciprocal root",
			eval:  func() (Result, error) { return Power(dec("2"), dec("-0.5")) },
			want:  "0.7071067811865475244008443621",
			exact: false,
		},
		{
			name:  "power: 16^0.25 is the exact fourth root",
			eval:  func() (Result, error) { return Power(dec("16"), dec("0.25")) },
			want:  "2",
			exact: true,
		},
		{
			name:  "power: 4^-0.5 is the exact reciprocal root",
			eval:  func() (Result, error) { return Power(dec("4"), dec("-0.5")) },
			want:  "0.5",
			exact: true,
		},
		{
			// The reciprocal is a division by an intermediate — 1e49^1000 —
			// whose magnitude is far past the cap although both Operands are
			// inside it. Judging that intermediate against the cap would refuse
			// a Calculation nothing asks to be refused: the positive exponent
			// computes, so the negative one does too.
			name:  "power: a 50-digit Operand at -1000 computes, because the reciprocal's intermediate is not re-judged",
			eval:  func() (Result, error) { return Power(dec("1"+strings.Repeat("0", 49)), dec("-1000")) },
			want:  "0." + strings.Repeat("0", 48999) + "1",
			exact: true,
		},
		{
			// 2^0.3 = 1.23114441334491628449939306916774..., and 3/10 in lowest
			// terms asks for value^10 == 2^3, which a rounded value cannot meet.
			name:  "power: 2^0.3 cannot meet its witness, so it is reported inexact",
			eval:  func() (Result, error) { return Power(dec("2"), dec("0.3")) },
			want:  "1.231144413344916284499393069",
			exact: false,
		},
		{
			// 1^0.0001 is exactly 1, but 0.0001 reduced to lowest terms asks for
			// a ten-thousand-fold power to witness that — past the cap — so the
			// Result is reported inexact rather than computed.
			name:  "power: a witness past the cap is refused, not computed",
			eval:  func() (Result, error) { return Power(dec("1"), dec("0.0001")) },
			want:  "1",
			exact: false,
		},
		{
			name:  "sqrt: √2 keeps at least 28 correct significant digits and is inexact",
			eval:  func() (Result, error) { return Sqrt(dec("2")) },
			want:  sqrtTwo,
			exact: false,
		},
		{
			name:  "sqrt: √4 is 2 and exact",
			eval:  func() (Result, error) { return Sqrt(dec("4")) },
			want:  "2",
			exact: true,
		},
		{
			name:  "sqrt: √0.25 is 0.5 and exact",
			eval:  func() (Result, error) { return Sqrt(dec("0.25")) },
			want:  "0.5",
			exact: true,
		},
		{
			name:  "sqrt: √0 is 0 and exact",
			eval:  func() (Result, error) { return Sqrt(dec("0")) },
			want:  "0",
			exact: true,
		},
		{
			// √1e-60 is 1e-30, which rounding at Precision decimal places would
			// report as zero.
			name:  "sqrt: √1e-60 keeps its magnitude and is exact",
			eval:  func() (Result, error) { return Sqrt(dec("1e-60")) },
			want:  "0." + strings.Repeat("0", 29) + "1",
			exact: true,
		},
		{
			name:  "percentage: 15 percent of 200 is 30",
			eval:  func() (Result, error) { return Percentage(dec("15"), dec("200")), nil },
			want:  "30",
			exact: true,
		},
		{
			name:  "percentage: 33.3 percent of 10 is 3.33",
			eval:  func() (Result, error) { return Percentage(dec("33.3"), dec("10")), nil },
			want:  "3.33",
			exact: true,
		},
		{
			name:  "percentage: 0 percent of anything is 0",
			eval:  func() (Result, error) { return Percentage(dec("0"), dec("-42.5")), nil },
			want:  "0",
			exact: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.eval()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Value.String() != tc.want {
				t.Errorf("value = %q, want %q", got.Value.String(), tc.want)
			}
			if got.Exact != tc.exact {
				t.Errorf("exact = %v, want %v", got.Exact, tc.exact)
			}
		})
	}
}

func TestFailures(t *testing.T) {
	tests := []struct {
		name string
		eval func() (Result, error)
		want error
	}{
		{
			name: "0 ÷ 0 is an indeterminate form",
			eval: func() (Result, error) { return Divide(dec("0"), dec("0")) },
			want: ErrUndefinedResult,
		},
		{
			// Deliberate disagreement with shopspring/decimal: .Pow answers 0
			// and PowWithPrecision reports "cannot represent undefined value",
			// while Go's math.Pow(0, 0) answers 1. 0^0 is indeterminate, so this
			// package refuses rather than choosing one of those answers.
			name: "0^0 is an indeterminate form",
			eval: func() (Result, error) { return Power(dec("0"), dec("0")) },
			want: ErrUndefinedResult,
		},
		{
			name: "1 ÷ 0 is infinite",
			eval: func() (Result, error) { return Divide(dec("1"), dec("0")) },
			want: ErrDivisionByZero,
		},
		{
			name: "0^-2 is infinite",
			eval: func() (Result, error) { return Power(dec("0"), dec("-2")) },
			want: ErrDivisionByZero,
		},
		{
			name: "√-4 is imaginary",
			eval: func() (Result, error) { return Sqrt(dec("-4")) },
			want: ErrNegativeSquareRoot,
		},
		{
			name: "(-4)^0.5 is imaginary",
			eval: func() (Result, error) { return Power(dec("-4"), dec("0.5")) },
			want: ErrNegativeSquareRoot,
		},
		{
			name: "(-4)^-0.5 is imaginary",
			eval: func() (Result, error) { return Power(dec("-4"), dec("-0.5")) },
			want: ErrNegativeSquareRoot,
		},
		{
			name: "2^1001 is past the exponent cap",
			eval: func() (Result, error) { return Power(dec("2"), dec("1001")) },
			want: ErrResultTooLarge,
		},
		{
			name: "2^-1001 is past the exponent cap",
			eval: func() (Result, error) { return Power(dec("2"), dec("-1001")) },
			want: ErrResultTooLarge,
		},
		{
			name: "2^1000000 is refused without computing its 301,030 digits",
			eval: func() (Result, error) { return Power(dec("2"), dec("1000000")) },
			want: ErrResultTooLarge,
		},
		{
			// 1^1001 is 1: the cap is a check on the exponent before evaluation,
			// not a check on the size of the Result.
			name: "1^1001 is refused on its exponent, not on the size of its Result",
			eval: func() (Result, error) { return Power(dec("1"), dec("1001")) },
			want: ErrResultTooLarge,
		},
		{
			name: "0^1001 is capped before the zero-base guards run",
			eval: func() (Result, error) { return Power(dec("0"), dec("1001")) },
			want: ErrResultTooLarge,
		},
		{
			// Comparing this exponent to the cap would rescale it against 10^0,
			// building 10^1000000000 — hundreds of megabytes — inside the check
			// meant to refuse it. The suite's timeout is what pins that it does
			// not: unguarded, this row runs for minutes.
			name: "2^1e1000000000 is refused without comparing it to the cap",
			eval: func() (Result, error) { return Power(dec("2"), dec("1e1000000000")) },
			want: ErrResultTooLarge,
		},
		{
			// An exponent this small is not a small computation: it asks for a
			// root of order 10^1000000000.
			name: "2^1e-1000000000 is refused on the same magnitude, at the other end",
			eval: func() (Result, error) { return Power(dec("2"), dec("1e-1000000000")) },
			want: ErrResultTooLarge,
		},
		{
			// The hazard here is the base, not the exponent: √1e-1000000000 is
			// 1e-500000000, which PowWithPrecision would be asked to carry to
			// half a billion decimal places.
			name: "√1e-1000000000 is refused on the magnitude of its base",
			eval: func() (Result, error) { return Sqrt(dec("1e-1000000000")) },
			want: ErrResultTooLarge,
		},
		{
			// A whole-number power of a base this small does not exist at all:
			// unguarded, the library panics because the product's exponent,
			// -3000000000, overflows the int32 an exponent is held in.
			name: "(1e-1000000000)^3 is refused rather than overflowing the library's exponent",
			eval: func() (Result, error) { return Power(dec("1e-1000000000"), dec("3")) },
			want: ErrResultTooLarge,
		},
		{
			// The magnitude guard runs ahead of the zero-exponent short-circuit,
			// so a base this far out of band is refused even though x^0 is 1 for
			// every base inside the band.
			name: "(1e-1000000000)^0 is refused on its base, though x^0 is otherwise 1",
			eval: func() (Result, error) { return Power(dec("1e-1000000000"), dec("0")) },
			want: ErrResultTooLarge,
		},
		{
			// Unguarded, DivRound reaches either of two failures at this
			// magnitude: it panics with "overflow in decimal QuoRem", or it
			// returns a quotient — here 1e-2000000000 — whose String() is two
			// gigabytes of leading zeros.
			name: "1e-1000000000 ÷ 1e1000000000 is refused rather than overflowing DivRound",
			eval: func() (Result, error) { return Divide(dec("1e-1000000000"), dec("1e1000000000")) },
			want: ErrResultTooLarge,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.eval()
			if !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
			if !got.Value.IsZero() || got.Exact {
				t.Errorf("failed evaluation returned %+v, want the zero Result", got)
			}
		})
	}
}

func TestExponentCapAdmitsItsBoundary(t *testing.T) {
	got, err := Power(dec("2"), dec("1000"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if digits := got.Value.NumDigits(); digits != 302 {
		t.Errorf("2^1000 has %d digits, want 302", digits)
	}
	if !got.Exact {
		t.Error("2^1000 reported inexact, want exact")
	}
}

func TestExponentCapRefusesBeforeComputing(t *testing.T) {
	const refusals = 100

	start := time.Now()
	for range refusals {
		if _, err := Power(dec("2"), dec("1000000")); !errors.Is(err, ErrResultTooLarge) {
			t.Fatalf("error = %v, want %v", err, ErrResultTooLarge)
		}
	}
	refused := time.Since(start)

	start = time.Now()
	if _, err := dec("2").PowWithPrecision(dec("1000000"), Precision); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	computed := time.Since(start)

	// The cap is a comparison, so a hundred refusals cost less than the single
	// 301,030-digit computation they refuse. Measuring that computation here
	// rather than pinning a duration keeps the check off the speed of whichever
	// machine runs it.
	if refused > computed {
		t.Errorf("%d refusals took %v while one computation took %v, so the cap is not refusing before computing", refusals, refused, computed)
	}
}

func TestMagnitudeCapRefusesOnlyPastItsBoundary(t *testing.T) {
	// The constant-time magnitude guard is a filter on what the exact comparison
	// cannot afford to reach, not a second, tighter cap: a base at the boundary
	// is still computed.
	if _, err := Power(dec("1e1001"), dec("2")); !errors.Is(err, ErrResultTooLarge) {
		t.Errorf("1e1001^2: error = %v, want %v", err, ErrResultTooLarge)
	}
	got, err := Power(dec("1e1000"), dec("2"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := dec("1e2000"); !got.Value.Equal(want) {
		t.Errorf("1e1000^2 = %v, want %v", got.Value, want)
	}
	if !got.Exact {
		t.Error("1e1000^2 reported inexact, want exact")
	}
}

func TestPrecisionGovernsWithoutTouchingTheLibraryGlobal(t *testing.T) {
	if Precision != 28 {
		t.Errorf("Precision = %d, want 28", Precision)
	}
	// 16 is the library default: this package neither reads nor assigns
	// DivisionPrecision, and derives every rounding scale from Precision at the
	// call site instead.
	if decimal.DivisionPrecision != 16 {
		t.Errorf("decimal.DivisionPrecision = %d, want the library default 16", decimal.DivisionPrecision)
	}
}

func TestNoInputReachesAPanic(t *testing.T) {
	// Every form the contract's Operand pattern admits, at the magnitudes that
	// reach a guard: zero, both signs, sub-integer, the exponent cap and just
	// past it, and the longest Operand the contract allows.
	operands := []string{
		"0", "1", "-1", "0.5", "-0.5", "2", "-2", "0.0000000001",
		"1000", "-1000", "1001", "-1001",
		"99999999999999999999999999999999999999999999999999",
	}

	for _, left := range operands {
		for _, right := range operands {
			t.Run(fmt.Sprintf("%s and %s", left, right), func(t *testing.T) {
				defer func() {
					if r := recover(); r != nil {
						t.Fatalf("panicked: %v", r)
					}
				}()
				l, r := dec(left), dec(right)
				Add(l, r)
				Subtract(l, r)
				Multiply(l, r)
				Percentage(l, r)
				if _, err := Divide(l, r); err != nil && !isDomainError(err) {
					t.Errorf("divide: unexpected error %v", err)
				}
				if _, err := Power(l, r); err != nil && !isDomainError(err) {
					t.Errorf("power: unexpected error %v", err)
				}
				if _, err := Sqrt(l); err != nil && !isDomainError(err) {
					t.Errorf("sqrt: unexpected error %v", err)
				}
			})
		}
	}
}

func isDomainError(err error) bool {
	return errors.Is(err, ErrUndefinedResult) ||
		errors.Is(err, ErrDivisionByZero) ||
		errors.Is(err, ErrNegativeSquareRoot) ||
		errors.Is(err, ErrResultTooLarge)
}

func TestConcurrentRootsDoNotRaceOnTheLibraryFactorialCache(t *testing.T) {
	// Every non-integer exponent reaches decimal's ExpTaylor, which appends to
	// an unsynchronised package-level factorial cache. Unserialised, eight
	// goroutines are enough for the race detector to report it and for a torn
	// read of the slice header to panic with an out-of-range index. Varied
	// operands keep the series running for different numbers of terms, which is
	// what makes one goroutine extend the cache while another reads it.
	bases := []string{"2", "3", "7", "10", "1.5", "0.5", "1e20", "1e-48"}
	exponents := []string{"0.5", "-0.5", "0.3", "2.5", "999.5", "0.0000000001"}

	var wg sync.WaitGroup
	for _, base := range bases {
		for _, exponent := range exponents {
			wg.Go(func() {
				if _, err := Power(dec(base), dec(exponent)); err != nil {
					t.Errorf("%s^%s: unexpected error: %v", base, exponent, err)
				}
				if _, err := Sqrt(dec(base)); err != nil {
					t.Errorf("√%s: unexpected error: %v", base, err)
				}
			})
		}
	}
	wg.Wait()
}
