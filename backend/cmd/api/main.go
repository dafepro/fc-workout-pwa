package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	databaseContext, cancelDatabase := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelDatabase()
	db, err := database.Open(databaseContext, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()
	if err := database.Migrate(databaseContext, db); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	repository := store.New(db, cfg.TeamTimeZone)
	sessions := authn.NewService(db)
	// A separate Argon2 slot from the player path. Sharing one held the
	// ceiling at 64 MiB but let a flood against the public player endpoint
	// starve console sign-in; 128 MiB of ceiling is the price of keeping the
	// two independent, and the 512 MiB VM carries it.
	staff := staffauth.NewService(db, cfg.StaffSecretKey, authn.NewSlot())
	if !staff.Configured() {
		slog.Warn("staff sign in is disabled because STAFF_SECRET_KEY is not set")
	}
	authenticator, resetAuthFixtures := configuredAuthenticator(cfg, sessions)

	handlerOptions := []httpapi.Option{
		httpapi.WithStore(repository),
		// A staff bearer token resolves through the same interface as a player
		// one, so authorization stays the single place that decides anything.
		httpapi.WithAuthenticator(authn.Fallback{Primary: authenticator, Secondary: staff}),
		httpapi.WithSessionManager(sessions),
		httpapi.WithStaffSessionManager(staff),
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithStaffAccountManager(staff),
		httpapi.WithCredentialManager(sessions),
	}
	if resetAuthFixtures != nil {
		handlerOptions = append(handlerOptions, httpapi.WithAuthFixtureReset(resetAuthFixtures))
	}
	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpapi.NewHandler(cfg, handlerOptions...),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("api listening", "port", cfg.Port, "environment", cfg.Environment)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownContext); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
		return nil
	}
}
