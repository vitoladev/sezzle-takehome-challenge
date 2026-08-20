package calc

import "errors"

// Failures are named by mathematical form rather than by the Operation that
// produced them, so a caller maps a form to a status code without knowing which
// Operation ran.
var (
	// ErrUndefinedResult is an indeterminate form: 0 ÷ 0, 0^0.
	ErrUndefinedResult = errors.New("undefined result")
	// ErrDivisionByZero is an infinite result: 1 ÷ 0, 0^-2.
	ErrDivisionByZero = errors.New("division by zero")
	// ErrNegativeSquareRoot is an imaginary result: √-4, (-4)^0.5.
	ErrNegativeSquareRoot = errors.New("negative square root")
	// ErrResultTooLarge is an exponent, or an operand magnitude, past the cap —
	// refused before evaluation, because what makes it too large is the size of
	// the Result it asks for rather than the Operation that asked.
	ErrResultTooLarge = errors.New("result too large")
)
