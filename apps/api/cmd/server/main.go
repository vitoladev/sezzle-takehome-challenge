package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/config"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/httpapi"
	"github.com/vitoladev/sezzle-takehome-challenge/api/internal/store"
)

const (
	readTimeout     = 5 * time.Second
	writeTimeout    = 10 * time.Second
	idleTimeout     = 60 * time.Second
	shutdownTimeout = 10 * time.Second
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(logger); err != nil {
		logger.Error("server exited", slog.Any("err", err))
		os.Exit(1)
	}
}

// Everything runs here so a bind failure returns through main's deferred
// cleanup instead of os.Exit-ing past it.
func run(logger *slog.Logger) error {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mux := http.NewServeMux()
	httpapi.HandlerWithOptions(httpapi.NewServer(logger, store.NewMemory[httpapi.Calculation]()), httpapi.StdHTTPServerOptions{
		BaseRouter:       mux,
		BaseURL:          "/api",
		ErrorHandlerFunc: httpapi.ErrorHandler(logger),
	})

	validate, err := httpapi.WithSpecValidation(logger)
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      httpapi.WithLogging(logger, httpapi.WithRecover(logger, httpapi.WithCORS(validate(mux)))),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	listenErr := make(chan error, 1)
	go func() {
		logger.Info("api listening", slog.String("addr", server.Addr))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			listenErr <- err
		}
	}()

	select {
	case err := <-listenErr:
		return err
	case <-ctx.Done():
	}
	// Restore default signal handling so a second signal kills a hung drain.
	stop()

	logger.Info("api shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("api shutdown", slog.Any("err", err))
	}
	logger.Info("api stopped")
	return nil
}
