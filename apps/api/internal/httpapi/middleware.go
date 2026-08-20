package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/google/uuid"
	nethttpmiddleware "github.com/oapi-codegen/nethttp-middleware"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/store"
)

const (
	// The two messages every failure that is nobody's specific fault falls back
	// to. A panic and a rejection say the same thing to a client because
	// neither tells it anything it can act on.
	internalErrorMessage = "an unexpected error occurred"
	contractMessage      = "the request does not match the API contract"
)

// nginx's "client closed request": not a status any server puts on the wire,
// but the conventional way an access log records a client that went away
// before a response did.
const statusClientClosedRequest = 499

// NewHandler builds the served handler: the generated routes under /api,
// wrapped in the middleware chain. It is the one place the chain is composed,
// so what a test drives is what main serves.
//
// The nesting is load-bearing, outermost first: WithLogging so every request
// leaves an access-log line whatever rejects it; WithRecover outside both of
// the below so a panic in either still answers in the contract's Error shape;
// WithCORS ahead of validation because a preflight is not in the spec, so
// validation reaching it first would reject it as an undefined route.
func NewHandler(logger *slog.Logger, history store.Store[Calculation]) (http.Handler, error) {
	mux := http.NewServeMux()
	HandlerWithOptions(NewServer(logger, history), StdHTTPServerOptions{
		BaseRouter:       mux,
		BaseURL:          "/api",
		ErrorHandlerFunc: ErrorHandler(logger),
	})

	validate, err := WithSpecValidation(logger)
	if err != nil {
		return nil, err
	}

	return WithLogging(logger, WithRecover(logger, WithCORS(validate(mux)))), nil
}

type loggerCtxKey struct{}

func withRequestLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerCtxKey{}, logger)
}

func requestLogger(ctx context.Context, fallback *slog.Logger) *slog.Logger {
	if l, ok := ctx.Value(loggerCtxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return fallback
}

func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

func WithCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Session-Id")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Answers a panicking request with the contract's Error shape instead of dropping
// the connection.
func WithRecover(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			// net/http's own signal to drop the connection silently — recovering
			// from it would turn an intentional abort into a 500.
			if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(v)
			}
			log := requestLogger(r.Context(), logger)
			log.Error("panic", slog.Any("panic", v), slog.String("stack", string(debug.Stack())))
			// A committed response can only be truncated, not corrected.
			if !rec.wrote {
				writeJSON(rec, http.StatusInternalServerError, Error{Error: InternalError, Message: internalErrorMessage}, log)
			}
		}()
		next.ServeHTTP(rec, r)
	})
}

func WithLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := newRequestID()
		log := logger.With(slog.String("request_id", reqID))
		r = r.WithContext(withRequestLogger(r.Context(), log))
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		// Deferred so a panicking request still leaves an access-log line.
		defer func() {
			// The recorder's 200 is an initial value, not an observation: a
			// request abandoned at the admission gate returns without ever
			// writing, and logging its 200 would claim a response no client was
			// ever sent.
			status := rec.status
			if !rec.wrote {
				status = statusClientClosedRequest
			}
			log.Info("request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", status),
				slog.Duration("duration", time.Since(start).Round(time.Microsecond)),
			)
		}()
		next.ServeHTTP(rec, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.wrote {
		return
	}
	r.status = status
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.ResponseWriter.Write(b)
}

// Keeps http.NewResponseController able to reach the underlying writer's
// Flush/Hijack through the wrapper.
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

// WithSpecValidation validates every request against the embedded openapi.yaml
// before it reaches a handler, so the spec enforces the contract at runtime
// rather than only generating code from it. It is what makes the Operand
// pattern, the arity of each `oneOf` variant, and the presence and UUID form of
// X-Session-Id preconditions the handlers may rely on.
func WithSpecValidation(logger *slog.Logger) (func(http.Handler) http.Handler, error) {
	spec, err := GetSpec()
	if err != nil {
		return nil, fmt.Errorf("load embedded spec: %w", err)
	}
	defineUUIDFormat()

	return nethttpmiddleware.OapiRequestValidatorWithOptions(spec, &nethttpmiddleware.Options{
		// The spec's only server is the relative /api the frontend proxies to,
		// so there is no Host to validate and nothing for the warning to warn
		// about.
		SilenceServersWarning: true,
		ErrorHandlerWithOpts: func(ctx context.Context, err error, w http.ResponseWriter, r *http.Request, opts nethttpmiddleware.ErrorHandlerOpts) {
			log := requestLogger(ctx, logger)
			log.Warn("contract validation", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("err", err))
			writeJSON(w, opts.StatusCode, validationError(opts.StatusCode, err), log)
		},
	}), nil
}

// kin-openapi treats a `format` as documentation unless a validator is
// registered for it, so without this X-Session-Id would only have to be a
// string. The check is uuid.Parse rather than kin-openapi's RFC4122 regexp so
// it accepts exactly what the generated binder downstream accepts: the regexp
// rejects a UUID whose version and variant nibbles are not those of a generated
// one, which the binder is happy to parse. The registry it writes to is a
// package-level map, so the write happens once however often a server is built.
var defineUUIDFormat = sync.OnceFunc(func() {
	openapi3.DefineStringFormatValidator("uuid", openapi3.NewCallbackValidator(func(value string) error {
		_, err := uuid.Parse(value)
		return err
	}))
})

// validationError renders a rejection in the contract's Error shape, so a
// validation failure and a domain failure are the same shape to a client.
func validationError(status int, err error) Error {
	if status >= http.StatusInternalServerError {
		return Error{Error: InternalError, Message: internalErrorMessage}
	}
	return Error{Error: InvalidRequest, Message: validationMessage(err)}
}

// validationMessage says what was rejected in the contract's own vocabulary.
// kin-openapi's strings describe its schema walk — JSON pointers, `oneOf`,
// schema keywords — and none of that belongs on the wire, so only the parameter
// or property name it identified is carried over.
func validationMessage(err error) string {

	// A type assertion rather than errors.As: a RequestError about a `oneOf`
	// carries a MultiError of its own, and unwrapping into that would discard
	// the RequestError that says which part of the request was rejected.
	if multi, ok := err.(openapi3.MultiError); ok && len(multi) > 0 {
		err = multi[0]
	}
	switch {
	case errors.Is(err, routers.ErrPathNotFound):
		return "no endpoint is defined for this path"
	case errors.Is(err, routers.ErrMethodNotAllowed):
		return "this method is not defined for this path"
	}

	var requestErr *openapi3filter.RequestError
	if !errors.As(err, &requestErr) {
		return contractMessage
	}
	if parameter := requestErr.Parameter; parameter != nil {
		return fmt.Sprintf("the %s %s is missing or malformed", parameter.Name, parameter.In)
	}
	var schemaErr *openapi3.SchemaError
	if errors.As(requestErr.Err, &schemaErr) {
		if property := rejectedProperty(schemaErr); property != "" {
			return fmt.Sprintf("the request body property %q does not match the API contract", property)
		}
	}
	return "the request body does not match the API contract"
}

// rejectedProperty names the property a schema failure was about, or nothing if
// the failure was about the body as a whole. A `oneOf` reports itself at the
// object — "matches no variant" — and names the property only inside the
// failures that ruled each variant out, so the outer error is asked first and
// the ones it wraps second.
func rejectedProperty(schemaErr *openapi3.SchemaError) string {
	if pointer := schemaErr.JSONPointer(); len(pointer) > 0 {
		return strings.Join(pointer, ".")
	}
	var ruledOut openapi3.MultiError
	if !errors.As(schemaErr.Origin, &ruledOut) {
		return ""
	}
	for _, err := range ruledOut {
		var inner *openapi3.SchemaError
		if errors.As(err, &inner) && len(inner.JSONPointer()) > 0 {
			return strings.Join(inner.JSONPointer(), ".")
		}
	}
	return ""
}
