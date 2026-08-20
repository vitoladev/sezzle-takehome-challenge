package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime"

	"github.com/shopspring/decimal"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/calc"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/store"
	"golang.org/x/sync/semaphore"
)

// Server implements the generated ServerInterface; add one method here per
// operation as the contract grows.
type Server struct {
	logger  *slog.Logger
	history store.Store[Calculation]
}

func NewServer(logger *slog.Logger, history store.Store[Calculation]) *Server {
	return &Server{logger: logger, history: history}
}

var _ ServerInterface = (*Server)(nil)

func (s *Server) GetHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, Health{Status: "ok"}, requestLogger(r.Context(), s.logger))
}

func (s *Server) PostCalculations(w http.ResponseWriter, r *http.Request, params PostCalculationsParams) {
	log := requestLogger(r.Context(), s.logger)

	var request CalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		log.Warn("decode request body", slog.Any("err", err))
		writeJSON(w, http.StatusBadRequest, Error{Error: InvalidRequest, Message: "the request body is not valid JSON"}, log)
		return
	}

	calculation, err := evaluate(r.Context(), request)
	if err != nil {
		// The client is gone, so there is no status to send and nothing to
		// send it to: this request stopped waiting for its turn at powGate.
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			log.Warn("abandoned before evaluation", slog.Any("err", err))
			return
		}
		status, body := errorResponse(err)
		if status == http.StatusInternalServerError {
			log.Error("evaluate calculation", slog.Any("err", err))
		}
		writeJSON(w, status, body, log)
		return
	}

	// Recorded before the Result is sent, so a caller that immediately reads its
	// History cannot miss the Calculation it was just answered.
	s.history.Record(params.XSessionId, calculation)
	writeJSON(w, http.StatusOK, calculation, log)
}

func (s *Server) GetCalculations(w http.ResponseWriter, r *http.Request, params GetCalculationsParams) {
	log := requestLogger(r.Context(), s.logger)
	writeJSON(w, http.StatusOK, History(s.history.List(params.XSessionId)), log)
}

// errUnknownOperation is the discriminator the contract admits but this switch
// does not answer — an Operation added to the spec and not to the switch. It is
// reported as a server fault rather than a client one, because the request was
// exactly what the contract asked for.
var errUnknownOperation = errors.New("unknown operation")

func evaluate(ctx context.Context, request CalculationRequest) (Calculation, error) {
	name, err := request.Discriminator()
	if err != nil {
		return Calculation{}, err
	}

	switch operation := Operation(name); operation {
	case OperationAdd, OperationSubtract, OperationMultiply, OperationDivide, OperationPower:
		return evaluateBinary(ctx, request, operation)
	case OperationSqrt:
		return evaluateUnary(ctx, request)
	case OperationPercentage:
		return evaluatePercentage(request)
	default:
		return Calculation{}, fmt.Errorf("%w %q", errUnknownOperation, name)
	}
}

func evaluateBinary(ctx context.Context, request CalculationRequest, operation Operation) (Calculation, error) {
	binary, err := request.AsBinaryCalculation()
	if err != nil {
		return Calculation{}, err
	}
	left, right, err := operands(binary.Left, binary.Right)
	if err != nil {
		return Calculation{}, err
	}

	var result calc.Result
	switch operation {
	case OperationAdd:
		result = calc.Add(left, right)
	case OperationSubtract:
		result = calc.Subtract(left, right)
	case OperationMultiply:
		result = calc.Multiply(left, right)
	case OperationDivide:
		result, err = calc.Divide(left, right)
	case OperationPower:
		result, err = power(ctx, left, right)
	}
	if err != nil {
		return Calculation{}, err
	}
	return Calculation{
		Operation: operation,
		Left:      &binary.Left,
		Right:     &binary.Right,
		Result:    result.Value.String(),
		Exact:     result.Exact,
	}, nil
}

// powGateSize is how many evaluations reaching the series may be inside calc at
// once. calc serialises the series itself behind a package mutex, and a request
// queued on a mutex cannot leave when its caller does, so the queue is moved out
// here where it can: this is the wait that honours r.Context().
//
// One per processor rather than one in total, because the work either side of
// the series is not serialised and is CPU-bound — a negative exponent's
// reciprocal is a division over tens of thousands of places. A gate of one puts
// that division behind the mutex as well, which measured at twice the latency of
// no gate at all under 128 requests in flight.
var powGateSize = int64(runtime.GOMAXPROCS(0))

// powGate is that admission. The mutex inside calc stays: it is what protects a
// direct, non-HTTP caller.
var powGate = semaphore.NewWeighted(powGateSize)

// underPowGate honours cancellation at admission, not after: a request already
// admitted runs to completion, which the contract's Operand bound holds to tens
// of milliseconds.
func underPowGate(ctx context.Context, evaluate func() (calc.Result, error)) (calc.Result, error) {
	if err := powGate.Acquire(ctx, 1); err != nil {
		return calc.Result{}, err
	}
	defer powGate.Release(1)
	return evaluate()
}

// power gates only a fractional exponent, mirroring calc's own branch: an
// integer exponent never reaches the series.
func power(ctx context.Context, base, exponent decimal.Decimal) (calc.Result, error) {
	if exponent.IsInteger() {
		return calc.Power(base, exponent)
	}
	return underPowGate(ctx, func() (calc.Result, error) { return calc.Power(base, exponent) })
}

func evaluateUnary(ctx context.Context, request CalculationRequest) (Calculation, error) {
	unary, err := request.AsUnaryCalculation()
	if err != nil {
		return Calculation{}, err
	}
	operand, err := decimal.NewFromString(unary.Operand)
	if err != nil {
		return Calculation{}, err
	}
	// A square root is a half power, so it always reaches the series.
	result, err := underPowGate(ctx, func() (calc.Result, error) { return calc.Sqrt(operand) })
	if err != nil {
		return Calculation{}, err
	}
	return Calculation{
		Operation: OperationSqrt,
		Operand:   &unary.Operand,
		Result:    result.Value.String(),
		Exact:     result.Exact,
	}, nil
}

func evaluatePercentage(request CalculationRequest) (Calculation, error) {
	percentage, err := request.AsPercentageCalculation()
	if err != nil {
		return Calculation{}, err
	}
	percent, of, err := operands(percentage.Percent, percentage.Of)
	if err != nil {
		return Calculation{}, err
	}
	result := calc.Percentage(percent, of)
	return Calculation{
		Operation: OperationPercentage,
		Percent:   &percentage.Percent,
		Of:        &percentage.Of,
		Result:    result.Value.String(),
		Exact:     result.Exact,
	}, nil
}

// operands parses the two Operands an Operation was sent. Spec validation has
// already held both to the Operand pattern, so a parse failure here is a
// disagreement between the pattern and the library rather than a bad request —
// which is why it is not translated into one.
func operands(first, second Operand) (decimal.Decimal, decimal.Decimal, error) {
	a, err := decimal.NewFromString(first)
	if err != nil {
		return decimal.Decimal{}, decimal.Decimal{}, err
	}
	b, err := decimal.NewFromString(second)
	if err != nil {
		return decimal.Decimal{}, decimal.Decimal{}, err
	}
	return a, b, nil
}

// domainErrors maps a failure's mathematical form to how it is reported. One
// table, so no handler decides a status code for itself. Everything absent from
// it is a server fault.
var domainErrors = map[error]struct {
	status int
	code   ErrorCode
}{
	calc.ErrUndefinedResult:    {http.StatusUnprocessableEntity, UndefinedResult},
	calc.ErrDivisionByZero:     {http.StatusUnprocessableEntity, DivisionByZero},
	calc.ErrNegativeSquareRoot: {http.StatusUnprocessableEntity, NegativeSquareRoot},
	calc.ErrResultTooLarge:     {http.StatusUnprocessableEntity, ResultTooLarge},
}

func errorResponse(err error) (int, Error) {
	for sentinel, reported := range domainErrors {
		if errors.Is(err, sentinel) {
			// The sentinel's own text is the human-readable form: "division by
			// zero" describes the failure without naming the Operation.
			return reported.status, Error{Error: reported.code, Message: sentinel.Error()}
		}
	}
	return http.StatusInternalServerError, Error{Error: InternalError, Message: internalErrorMessage}
}

// Replaces the generated default (plain-text http.Error) so binding failures
// use the contract's Error shape.
func ErrorHandler(logger *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		log := requestLogger(r.Context(), logger)
		log.Warn("bad request", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("err", err))
		writeJSON(w, http.StatusBadRequest, Error{Error: InvalidRequest, Message: bindingMessage(err)}, log)
	}
}

// bindingMessage keeps the binder's own strings — oapi-codegen jargon about
// parameter binding — off the wire; the parameter it names is the part a caller
// can act on. Spec validation runs ahead of the binder and answers almost
// everything it would, but not a header sent twice: kin-openapi reads only the
// first value, so that request validates and then fails to bind.
func bindingMessage(err error) string {
	var tooMany *TooManyValuesForParamError
	if errors.As(err, &tooMany) {
		return fmt.Sprintf("the %s header was sent more than once", tooMany.ParamName)
	}
	return contractMessage
}

func writeJSON(w http.ResponseWriter, status int, body any, logger *slog.Logger) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("write response", slog.Any("err", err))
	}
}
