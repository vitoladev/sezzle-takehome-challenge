package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"time"
)

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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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
				writeJSON(rec, http.StatusInternalServerError, Error{Error: InternalError, Message: "an unexpected error occurred"}, log)
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
			log.Info("request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
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
