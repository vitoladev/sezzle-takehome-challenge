package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Server implements the generated ServerInterface; add one method here per
// operation as the contract grows.
type Server struct {
	logger *slog.Logger
}

func NewServer(logger *slog.Logger) *Server {
	return &Server{logger: logger}
}

var _ ServerInterface = (*Server)(nil)

func (s *Server) GetHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, Health{Status: "ok"}, requestLogger(r.Context(), s.logger))
}

// Replaces the generated default (plain-text http.Error) so binding failures
// use the contract's Error shape.
func ErrorHandler(logger *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		log := requestLogger(r.Context(), logger)
		log.Warn("bad request", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("err", err))
		writeJSON(w, http.StatusBadRequest, Error{Error: InvalidRequest}, log)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any, logger *slog.Logger) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("write response", slog.Any("err", err))
	}
}
