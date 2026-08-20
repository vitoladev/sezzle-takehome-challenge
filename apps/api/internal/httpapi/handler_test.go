package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/calc"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/store"
)

const (
	sessionA = "11111111-1111-1111-1111-111111111111"
	sessionB = "22222222-2222-2222-2222-222222222222"
)

func newTestHandler(t *testing.T) http.Handler {
	t.Helper()
	return newLoggedTestHandler(t, io.Discard)
}

func newLoggedTestHandler(t *testing.T, logs io.Writer) http.Handler {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(logs, nil))
	mux := http.NewServeMux()
	HandlerWithOptions(NewServer(logger, store.NewMemory[Calculation]()), StdHTTPServerOptions{
		BaseRouter:       mux,
		BaseURL:          "/api",
		ErrorHandlerFunc: ErrorHandler(logger),
	})
	validate, err := WithSpecValidation(logger)
	if err != nil {
		t.Fatalf("spec validation: %v", err)
	}
	return WithLogging(logger, WithRecover(logger, WithCORS(validate(mux))))
}

func post(t *testing.T, handler http.Handler, session, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/calculations", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if session != "" {
		req.Header.Set("X-Session-Id", session)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func get(t *testing.T, handler http.Handler, session string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/calculations", nil)
	req.Header.Set("X-Session-Id", session)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body T
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return body
}

func TestGetHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestHandler(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if body := decode[Health](t, rec); body.Status != "ok" {
		t.Fatalf("status field = %q, want %q", body.Status, "ok")
	}
}

// One success per Operation, plus the Precision behaviour the API exists to
// make observable.
func TestPostCalculationsSucceeds(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		result string
		exact  bool
	}{
		{"add is exact in decimal", `{"operation":"add","left":"0.1","right":"0.2"}`, "0.3", true},
		{"an exact Result keeps no trailing zeros", `{"operation":"add","left":"2","right":"2"}`, "4", true},
		{"subtract", `{"operation":"subtract","left":"1","right":"0.9"}`, "0.1", true},
		{"multiply", `{"operation":"multiply","left":"1.5","right":"4"}`, "6", true},
		{"a terminating quotient is exact", `{"operation":"divide","left":"10","right":"4"}`, "2.5", true},
		{"a repeating quotient is inexact", `{"operation":"divide","left":"1","right":"3"}`, "0.3333333333333333333333333333", false},
		{"power", `{"operation":"power","left":"2","right":"10"}`, "1024", true},
		{"sqrt of a perfect square is exact", `{"operation":"sqrt","operand":"9"}`, "3", true},
		{"sqrt of two is inexact", `{"operation":"sqrt","operand":"2"}`, "1.414213562373095048801688724", false},
		{"percentage is percent-of", `{"operation":"percentage","percent":"15","of":"200"}`, "30", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := post(t, newTestHandler(t), sessionA, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body.String())
			}
			body := decode[Calculation](t, rec)
			if body.Result != tt.result {
				t.Fatalf("result = %q, want %q", body.Result, tt.result)
			}
			if body.Exact != tt.exact {
				t.Fatalf("exact = %v, want %v", body.Exact, tt.exact)
			}
		})
	}
}

// An inexact Result carries Precision significant digits, which is what makes
// "at least 28 correct significant digits" checkable rather than a matter of
// how the digits happen to look.
func TestInexactResultCarriesPrecisionSignificantDigits(t *testing.T) {
	rec := post(t, newTestHandler(t), sessionA, `{"operation":"sqrt","operand":"2"}`)
	body := decode[Calculation](t, rec)

	digits := len(strings.ReplaceAll(strings.TrimPrefix(body.Result, "0."), ".", ""))
	if digits != calc.Precision {
		t.Fatalf("√2 = %q carries %d significant digits, want %d", body.Result, digits, calc.Precision)
	}
}

func TestPostCalculationsEchoesItsOperands(t *testing.T) {
	handler := newTestHandler(t)

	binary := decode[Calculation](t, post(t, handler, sessionA, `{"operation":"add","left":"0.1","right":"0.2"}`))
	if binary.Left == nil || *binary.Left != "0.1" || binary.Right == nil || *binary.Right != "0.2" {
		t.Fatalf("binary Operands = %+v, want left 0.1 and right 0.2", binary)
	}
	unary := decode[Calculation](t, post(t, handler, sessionA, `{"operation":"sqrt","operand":"9"}`))
	if unary.Operand == nil || *unary.Operand != "9" {
		t.Fatalf("unary Operand = %+v, want 9", unary)
	}
	percentage := decode[Calculation](t, post(t, handler, sessionA, `{"operation":"percentage","percent":"15","of":"200"}`))
	if percentage.Percent == nil || *percentage.Percent != "15" || percentage.Of == nil || *percentage.Of != "200" {
		t.Fatalf("percentage Operands = %+v, want percent 15 and of 200", percentage)
	}
}

// One response per error form: each is a different mathematical outcome and is
// reported as a different thing.
func TestPostCalculationsRejectsByMathematicalForm(t *testing.T) {
	tests := []struct {
		name string
		body string
		code ErrorCode
	}{
		{"zero over zero is indeterminate", `{"operation":"divide","left":"0","right":"0"}`, UndefinedResult},
		{"zero to the zero is indeterminate", `{"operation":"power","left":"0","right":"0"}`, UndefinedResult},
		{"one over zero is infinite", `{"operation":"divide","left":"1","right":"0"}`, DivisionByZero},
		{"zero to a negative power is infinite", `{"operation":"power","left":"0","right":"-2"}`, DivisionByZero},
		{"the root of a negative is imaginary", `{"operation":"sqrt","operand":"-4"}`, NegativeSquareRoot},
		{"an exponent past the cap is refused", `{"operation":"power","left":"2","right":"1001"}`, ResultTooLarge},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := post(t, newTestHandler(t), sessionA, tt.body)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422; body %s", rec.Code, rec.Body.String())
			}
			assertError(t, rec, tt.code)
		})
	}
}

// Contract validation answers before any handler runs, so the handlers never
// see a request the spec forbids.
func TestSpecValidationRejectsBeforeAnyHandlerRuns(t *testing.T) {
	tests := []struct {
		name    string
		session string
		body    string
	}{
		{"sqrt with two Operands has no variant", sessionA, `{"operation":"sqrt","left":"1","right":"2"}`},
		{"an unknown Operation is not in the enum", sessionA, `{"operation":"cube","left":"1","right":"2"}`},
		{"an Operand in exponent notation is not a decimal string", sessionA, `{"operation":"add","left":"1e10","right":"2"}`},
		{"an Operand past maxLength", sessionA, `{"operation":"add","left":"` + strings.Repeat("9", 51) + `","right":"2"}`},
		{"an unknown property", sessionA, `{"operation":"add","left":"1","right":"2","rounding":"up"}`},
		{"a missing Operand", sessionA, `{"operation":"add","left":"1"}`},
		{"a body that is not JSON", sessionA, `not json`},
		{"a missing Session", "", `{"operation":"add","left":"1","right":"2"}`},
		{"a Session that is not a UUID", "not-a-uuid", `{"operation":"add","left":"1","right":"2"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandler(t)
			rec := post(t, handler, tt.session, tt.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body.String())
			}
			assertError(t, rec, InvalidRequest)
			// Nothing was recorded, which is how "before any handler runs" is
			// observable from outside.
			if history := decode[History](t, get(t, handler, sessionA)); len(history) != 0 {
				t.Fatalf("History = %v after a rejected POST, want it untouched", history)
			}
		})
	}
}

// A rejection about one Operand names it; a rejection about the shape of the
// body as a whole cannot, and says so instead of naming something arbitrary.
func TestSpecValidationNamesTheRejectedProperty(t *testing.T) {
	handler := newTestHandler(t)

	operand := decode[Error](t, post(t, handler, sessionA, `{"operation":"add","left":"1e10","right":"2"}`))
	if !strings.Contains(operand.Message, `"left"`) {
		t.Fatalf("message = %q, want it to name the left Operand", operand.Message)
	}
	shape := decode[Error](t, post(t, handler, sessionA, `{"operation":"sqrt","left":"1","right":"2"}`))
	if strings.Contains(shape.Message, "property") {
		t.Fatalf("message = %q, want it to blame the body rather than one property", shape.Message)
	}
}

func TestUnknownEndpointsAnswerInTheContractsErrorShape(t *testing.T) {
	handler := newTestHandler(t)

	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/nowhere", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", missing.Code)
	}
	assertError(t, missing, InvalidRequest)

	// A method the path does not define answers 404, not 405: the contract
	// declares no response for a request it does not describe, and the status is
	// pinned here so changing it has to be a deliberate act.
	wrongMethod := httptest.NewRecorder()
	handler.ServeHTTP(wrongMethod, httptest.NewRequest(http.MethodDelete, "/api/calculations", nil))
	if wrongMethod.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", wrongMethod.Code)
	}
	assertError(t, wrongMethod, InvalidRequest)
}

func TestGetCalculationsReturnsOnlyTheCallingSessionsHistory(t *testing.T) {
	handler := newTestHandler(t)
	for _, body := range []string{
		`{"operation":"add","left":"1","right":"1"}`,
		`{"operation":"multiply","left":"3","right":"3"}`,
	} {
		if rec := post(t, handler, sessionA, body); rec.Code != http.StatusOK {
			t.Fatalf("seed POST: status %d, body %s", rec.Code, rec.Body.String())
		}
	}

	mine := get(t, handler, sessionA)
	if mine.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", mine.Code)
	}
	history := decode[History](t, mine)
	if len(history) != 2 {
		t.Fatalf("History holds %d Calculations, want 2", len(history))
	}
	if history[0].Result != "9" {
		t.Fatalf("newest Result = %q, want 9 — History is newest first", history[0].Result)
	}

	theirs := get(t, handler, sessionB)
	if body := theirs.Body.String(); strings.TrimSpace(body) != "[]" {
		t.Fatalf("other Session's History = %s, want []", body)
	}
}

func TestGetCalculationsIsBoundedByTheHistoryBound(t *testing.T) {
	handler := newTestHandler(t)
	for range store.MaxItems + 1 {
		post(t, handler, sessionA, `{"operation":"add","left":"1","right":"1"}`)
	}

	if history := decode[History](t, get(t, handler, sessionA)); len(history) != store.MaxItems {
		t.Fatalf("History holds %d Calculations, want %d", len(history), store.MaxItems)
	}
}

// Bodies spec validation would never have passed on, so each reaches a guard
// the handler keeps anyway. All are server faults rather than client ones: by
// the time a request is here it has already been judged against the contract,
// so an unrecognised discriminator or an Operand the Operand pattern admits and
// the decimal parser rejects is a disagreement inside the server. None of them
// may fall through to a zero-value Result.
func TestBodiesTheContractWouldHaveRefusedAreServerFaults(t *testing.T) {
	tests := []struct{ name, body string }{
		{"a discriminator that is not a string", `{"operation":5,"left":"1","right":"2"}`},
		{"a discriminator the switch does not answer", `{"operation":"cube","left":"2","right":"3"}`},
		{"a binary Operand that is not a string", `{"operation":"add","left":5,"right":"2"}`},
		{"a left Operand that is not a decimal", `{"operation":"add","left":"abc","right":"2"}`},
		{"a right Operand that is not a decimal", `{"operation":"add","left":"1","right":"abc"}`},
		{"a unary Operand that is not a string", `{"operation":"sqrt","operand":5}`},
		{"a unary Operand that is not a decimal", `{"operation":"sqrt","operand":"abc"}`},
		{"a percentage Operand that is not a string", `{"operation":"percentage","percent":5,"of":"2"}`},
		{"a percentage Operand that is not a decimal", `{"operation":"percentage","percent":"abc","of":"2"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postDirect(t, tt.body)
			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500; body %s", rec.Code, rec.Body.String())
			}
			assertError(t, rec, InternalError)
		})
	}
}

// A rejection the validator suggests answering with a 5xx is a server fault, so
// it says nothing about the request. Unreachable while the contract has no
// security requirements, which is the only rejection kin-openapi grades that
// way.
func TestServerSideValidationFailuresAreNotBlamedOnTheCaller(t *testing.T) {
	body := validationError(http.StatusInternalServerError, errors.New("some validator fault"))

	if body.Error != InternalError {
		t.Fatalf("error = %q, want %q", body.Error, InternalError)
	}
	if body.Message != internalErrorMessage {
		t.Fatalf("message = %q, want %q", body.Message, internalErrorMessage)
	}
}

// A binder failure with no parameter to name still explains itself without
// quoting the binder.
func TestBinderFailuresRenderInTheContractsErrorShape(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	rec := httptest.NewRecorder()
	ErrorHandler(logger)(rec, httptest.NewRequest(http.MethodGet, "/api/calculations", nil), &RequiredHeaderError{ParamName: "X-Session-Id"})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := assertError(t, rec, InvalidRequest); body.Message != contractMessage {
		t.Fatalf("message = %q, want %q", body.Message, contractMessage)
	}
}

// Likewise unreachable behind spec validation, which decodes the body before
// the handler does.
func TestUnparsableBodyIsRejected(t *testing.T) {
	rec := postDirect(t, `{`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body.String())
	}
	assertError(t, rec, InvalidRequest)
}

// postDirect calls the handler with spec validation bypassed, to reach the
// guards that exist for a request validation would never have passed on.
func postDirect(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := NewServer(logger, store.NewMemory[Calculation]())
	req := httptest.NewRequest(http.MethodPost, "/api/calculations", strings.NewReader(body))
	rec := httptest.NewRecorder()
	server.PostCalculations(rec, req, PostCalculationsParams{})
	return rec
}

func TestRecoverAnswersAPanicWithTheContractsErrorShape(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("the panic no probe found")
	})

	rec := httptest.NewRecorder()
	WithLogging(logger, WithRecover(logger, panicking)).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	assertError(t, rec, InternalError)
}

// The header the frontend sends must survive a cross-origin preflight.
func TestPreflightAdvertisesTheSessionHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestHandler(t).ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, "/api/calculations", nil))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if allowed := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(allowed, "X-Session-Id") {
		t.Fatalf("Access-Control-Allow-Headers = %q, want it to include X-Session-Id", allowed)
	}
}

// A repeated header is the one binder failure spec validation does not answer
// first: kin-openapi reads only the first value.
func TestRepeatedSessionHeaderIsRejectedWithoutBinderJargon(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/calculations", nil)
	req.Header.Add("X-Session-Id", sessionA)
	req.Header.Add("X-Session-Id", sessionB)
	rec := httptest.NewRecorder()
	newTestHandler(t).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body.String())
	}
	body := assertError(t, rec, InvalidRequest)
	if !strings.Contains(body.Message, "X-Session-Id") {
		t.Fatalf("message = %q, want it to name the header", body.Message)
	}
}

func assertError(t *testing.T, rec *httptest.ResponseRecorder, want ErrorCode) Error {
	t.Helper()
	body := decode[Error](t, rec)
	if body.Error != want {
		t.Fatalf("error = %q, want %q", body.Error, want)
	}
	if body.Message == "" {
		t.Fatal("message is empty; every failure explains itself")
	}
	if strings.Contains(body.Message, "openapi") || strings.Contains(body.Message, "schema") {
		t.Fatalf("message = %q leaks validator internals", body.Message)
	}
	return body
}

// The series calc serialises is reached under powGate, and a caller that has
// gone leaves the queue instead of taking a turn at it.
func TestAbandonedRequestStopsWaitingForTheSeriesGate(t *testing.T) {
	var logs bytes.Buffer
	handler := newLoggedTestHandler(t, &logs)
	// The whole gate, held for the whole test, so the request below can only
	// ever be queued for admission.
	if err := powGate.Acquire(t.Context(), powGateSize); err != nil {
		t.Fatalf("hold the gate: %v", err)
	}
	defer powGate.Release(powGateSize)

	ctx, cancel := context.WithCancel(t.Context())
	request := httptest.NewRequest(http.MethodPost, "/api/calculations", strings.NewReader(`{"operation":"sqrt","operand":"2"}`)).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Session-Id", sessionA)
	rec := httptest.NewRecorder()

	answered := make(chan struct{})
	go func() {
		defer close(answered)
		handler.ServeHTTP(rec, request)
	}()

	// A negative check, not synchronisation: nothing may answer while the gate
	// is held, so the only way past here is the timer.
	select {
	case <-answered:
		t.Fatal("answered while the gate was held — the request never queued")
	case <-time.After(50 * time.Millisecond):
	}

	cancel()
	select {
	case <-answered:
	case <-time.After(5 * time.Second):
		t.Fatal("a cancelled request kept waiting for its turn at the gate")
	}
	// The recorder's Code is 200 whether or not anything was written, so the
	// body is what says nothing was sent to a client that had gone.
	if body := rec.Body.String(); body != "" {
		t.Fatalf("wrote %q to a client that had gone, want nothing", body)
	}
	// The access log is what someone reads during an abandonment storm, so it
	// must not report the 200 the recorder was initialised with.
	if line := logs.String(); !strings.Contains(line, "status=499") || strings.Contains(line, "status=200") {
		t.Fatalf("logged %q, want status=499 for a response that was never sent", line)
	}
}

// Admitting one series evaluation at a time must not lose or corrupt a Result.
// Under -race, this and calc's own concurrency test are what say the
// serialisation still holds.
func TestConcurrentSeriesCalculationsStayCorrect(t *testing.T) {
	handler := newTestHandler(t)
	const perForm = 16
	forms := []struct{ body, result string }{
		{`{"operation":"sqrt","operand":"2"}`, "1.414213562373095048801688724"},
		{`{"operation":"power","left":"2","right":"0.5"}`, "1.414213562373095048801688724"},
	}

	recorders := make([]*httptest.ResponseRecorder, len(forms)*perForm)
	sessions := []string{sessionA, sessionB}
	var wg sync.WaitGroup
	for i := range recorders {
		wg.Go(func() {
			recorders[i] = post(t, handler, sessions[i%len(sessions)], forms[i/perForm].body)
		})
	}
	wg.Wait()

	for i, rec := range recorders {
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body.String())
		}
		body := decode[Calculation](t, rec)
		if body.Result != forms[i/perForm].result {
			t.Fatalf("result = %q, want %q", body.Result, forms[i/perForm].result)
		}
		if body.Exact {
			t.Fatal("exact = true, want false — √2 is irrational")
		}
	}
}
