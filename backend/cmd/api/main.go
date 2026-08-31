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
	"github.com/dafepro/fc-workout-pwa/backend/internal/observability"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
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
	logger := observability.NewLogger(os.Stdout, observability.Metadata{
		Service: "api", Environment: cfg.Environment, Release: cfg.ReleaseSHA,
	})
	slog.SetDefault(logger)
	metrics := observability.NewMetrics(cfg.ReleaseSHA)
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
	staffRepository := store.NewStaffStore(db)
	rewardMedia, err := rewardmedia.NewFileStore(cfg.RewardMediaDir)
	if err != nil {
		return fmt.Errorf("open reward media store: %w", err)
	}
	observedRepository := observability.NewObservedStore(repository, metrics)
	sessions := authn.NewService(db)
	// A separate Argon2 slot from the player path. Sharing one held the
	// ceiling at 64 MiB but let a flood against the public player endpoint
	// starve console sign-in; 128 MiB of ceiling is the price of keeping the
	// two independent, and the 512 MiB VM carries it.
	staff := staffauth.NewService(db, cfg.StaffSecretKey, authn.NewSlot())
	if !staff.Configured() {
		slog.Warn("staff sign in is disabled because STAFF_SECRET_KEY is not set")
	}
	authenticator, resetAuthFixtures := configuredAuthenticator(cfg, sessions, staff)

	loungeCatalog := teamlounge.BeachBoardwalkLoungeCatalog()
	handlerOptions := []httpapi.Option{
		httpapi.WithStore(observedRepository),
		httpapi.WithTeamLoungeStore(teamlounge.NewSQLiteStore(db, loungeCatalog)),
		// A staff bearer token resolves through the same interface as a player
		// one, so authorization stays the single place that decides anything.
		httpapi.WithAuthenticator(authn.Fallback{Primary: authenticator, Secondary: staff}),
		httpapi.WithSessionManager(sessions),
		httpapi.WithStaffSessionManager(staff),
		httpapi.WithStaffRepository(staffRepository),
		httpapi.WithTeamRewardMedia(rewardMedia, rewardmedia.NewProcessor()),
		httpapi.WithStaffAccountManager(staff),
		httpapi.WithCredentialManager(sessions),
		httpapi.WithMiddleware(observability.HTTPMiddleware(logger, metrics)),
	}
	if resetAuthFixtures != nil {
		handlerOptions = append(handlerOptions, httpapi.WithAuthFixtureReset(resetAuthFixtures))
	}
	if devAccess := configuredDevAccess(cfg, db, repository, sessions, staff); devAccess != nil {
		handlerOptions = append(handlerOptions, httpapi.WithDevAccessManager(devAccess))
	}
	applicationHandler := httpapi.NewHandler(cfg, handlerOptions...)
	server, metricsServer := newServers(cfg, applicationHandler, metrics.Handler())

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 2)
	go func() {
		slog.Info("api listening", "port", cfg.Port, "environment", cfg.Environment)
		serverErrors <- server.ListenAndServe()
	}()
	go func() {
		slog.Info("metrics listening", "port", cfg.MetricsPort)
		serverErrors <- metricsServer.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			_ = drainAndShutdown(cfg.ShutdownTimeout, applicationHandler, server, metricsServer)
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	case <-ctx.Done():
		if err := drainAndShutdown(cfg.ShutdownTimeout, applicationHandler, server, metricsServer); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
		return nil
	}
}

func drainAndShutdown(timeout time.Duration, handler http.Handler, servers ...*http.Server) error {
	drainContext, cancelDrain := context.WithTimeout(context.Background(), timeout)
	drainErr := httpapi.Drain(drainContext, handler)
	cancelDrain()
	if drainErr != nil {
		return fmt.Errorf("drain Team Lounge rooms: %w", drainErr)
	}
	return shutdownServers(timeout, servers...)
}

func newServers(cfg config.Config, applicationHandler, metricsHandler http.Handler) (*http.Server, *http.Server) {
	application := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           applicationHandler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	metrics := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.MetricsPort),
		Handler:           metricsHandler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	return application, metrics
}

func shutdownServers(timeout time.Duration, servers ...*http.Server) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for _, server := range servers {
		if err := server.Shutdown(ctx); err != nil {
			return err
		}
	}
	return nil
}
