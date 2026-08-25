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
	"github.com/dafepro/fc-workout-pwa/backend/internal/notifications"
	"github.com/dafepro/fc-workout-pwa/backend/internal/observability"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
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
	logger := observability.NewLogger(os.Stdout, observability.Metadata{
		Service: "api", Environment: cfg.Environment, Release: cfg.ReleaseSHA,
	})
	slog.SetDefault(logger)
	metrics := observability.NewMetrics(cfg.ReleaseSHA)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	databaseContext, cancelDatabase := context.WithTimeout(ctx, 15*time.Second)
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
	observedRepository := observability.NewObservedStore(repository, metrics)
	mailer := notifications.Mailer(notifications.Sink{})
	if cfg.RewardMailerMode == "resend" {
		mailer = notifications.Resend{APIKey: cfg.ResendAPIKey}
	}
	go notifications.Run(ctx, notifications.Sender{
		Outbox: repository, Mailer: mailer, From: cfg.RewardEmailFrom, BaseURL: cfg.RewardEmailBaseURL,
		Observer: metrics,
	})
	go monitorTeamRewardTransitions(ctx, repository, metrics)
	media, err := rewardmedia.NewFileStore(cfg.RewardMediaDir)
	if err != nil {
		return fmt.Errorf("open reward media storage: %w", err)
	}
	cleanupContext, cancelCleanup := context.WithTimeout(ctx, 15*time.Second)
	cleanupRewardMedia(cleanupContext, repository, media, time.Now().UTC())
	cancelCleanup()
	go monitorRewardMediaCleanup(ctx, repository, media)
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

	handlerOptions := []httpapi.Option{
		httpapi.WithStore(observedRepository),
		// A staff bearer token resolves through the same interface as a player
		// one, so authorization stays the single place that decides anything.
		httpapi.WithAuthenticator(authn.Fallback{Primary: authenticator, Secondary: staff}),
		httpapi.WithSessionManager(sessions),
		httpapi.WithStaffSessionManager(staff),
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithTeamRewardMedia(media, rewardmedia.NewProcessor()),
		httpapi.WithStaffAccountManager(staff),
		httpapi.WithCredentialManager(sessions),
		httpapi.WithMiddleware(observability.HTTPMiddleware(logger, metrics)),
		httpapi.WithOperationalObserver(metrics),
	}
	if resetAuthFixtures != nil {
		handlerOptions = append(handlerOptions, httpapi.WithAuthFixtureReset(resetAuthFixtures))
	}
	if devAccess := configuredDevAccess(cfg, db, repository, sessions, staff); devAccess != nil {
		handlerOptions = append(handlerOptions, httpapi.WithDevAccessManager(devAccess))
	}
	server, metricsServer := newServers(cfg, httpapi.NewHandler(cfg, handlerOptions...), metrics.Handler())
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
			shutdownServers(cfg.ShutdownTimeout, server, metricsServer)
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	case <-ctx.Done():
		if err := shutdownServers(cfg.ShutdownTimeout, server, metricsServer); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
		return nil
	}
}

func monitorTeamRewardTransitions(ctx context.Context, repository *store.Store, metrics *observability.Metrics) {
	refresh := func() {
		refreshContext, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		if err := repository.RefreshActiveTeamRewards(refreshContext, time.Now().UTC()); err != nil {
			metrics.ObserveFeature("team_rewards", "transition", "error")
			slog.Warn("team reward transition refresh failed", "error", err)
			return
		}
		metrics.ObserveFeature("team_rewards", "transition", "success")
	}
	refresh()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refresh()
		}
	}
}

func monitorRewardMediaCleanup(ctx context.Context, repository *store.Store, media rewardmedia.Store) {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			cleanupContext, cancel := context.WithTimeout(ctx, 30*time.Second)
			cleanupRewardMedia(cleanupContext, repository, media, now.UTC())
			cancel()
		}
	}
}

func cleanupRewardMedia(ctx context.Context, repository *store.Store, media rewardmedia.Store, now time.Time) {
	deleted, err := rewardmedia.CleanupExpired(ctx, repository, media, now.Add(-24*time.Hour), now)
	if err != nil {
		slog.Warn("reward media cleanup failed", "error", err)
		return
	}
	if deleted > 0 {
		slog.Info("reward media cleanup completed", "deleted", deleted)
	}
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
