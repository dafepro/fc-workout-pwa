package observability

import (
	"context"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type ObservedStore struct {
	*store.Store
	metrics *Metrics
}

func NewObservedStore(inner *store.Store, metrics *Metrics) *ObservedStore {
	return &ObservedStore{Store: inner, metrics: metrics}
}

func (observed *ObservedStore) Ping(ctx context.Context) error {
	return observeError(observed.metrics, "readiness", func() error { return observed.Store.Ping(ctx) })
}

func (observed *ObservedStore) CreateTrainingEntry(ctx context.Context, input store.CreateTrainingEntryInput) (store.TrainingEntry, error) {
	return observeValue(observed.metrics, "training_entries_create", func() (store.TrainingEntry, error) {
		return observed.Store.CreateTrainingEntry(ctx, input)
	})
}

func (observed *ObservedStore) CreatePlannedRestCheckIn(ctx context.Context, input store.CreatePlannedRestCheckInInput) (store.PlannedRestCheckIn, error) {
	return observeValue(observed.metrics, "planned_rest_create", func() (store.PlannedRestCheckIn, error) {
		return observed.Store.CreatePlannedRestCheckIn(ctx, input)
	})
}

func (observed *ObservedStore) ListTrainingEntries(ctx context.Context, playerID string, limit int) ([]store.TrainingEntry, error) {
	return observeValue(observed.metrics, "training_entries_read", func() ([]store.TrainingEntry, error) {
		return observed.Store.ListTrainingEntries(ctx, playerID, limit)
	})
}

func (observed *ObservedStore) GetTrainingEntry(ctx context.Context, entryID string) (store.TrainingEntry, error) {
	return observeValue(observed.metrics, "training_entries_read", func() (store.TrainingEntry, error) {
		return observed.Store.GetTrainingEntry(ctx, entryID)
	})
}

func (observed *ObservedStore) DeleteTrainingEntry(ctx context.Context, entryID string, now time.Time) (bool, error) {
	return observeValue(observed.metrics, "training_entries_delete", func() (bool, error) {
		return observed.Store.DeleteTrainingEntry(ctx, entryID, now)
	})
}

func (observed *ObservedStore) CreateReaction(ctx context.Context, input store.CreateReactionInput) (store.CreateReactionResult, error) {
	return observeValue(observed.metrics, "reactions", func() (store.CreateReactionResult, error) {
		return observed.Store.CreateReaction(ctx, input)
	})
}

func (observed *ObservedStore) ListReactionBadges(ctx context.Context, input store.ListReactionBadgesInput) ([]store.ReactionBadge, error) {
	return observeValue(observed.metrics, "reactions", func() ([]store.ReactionBadge, error) {
		return observed.Store.ListReactionBadges(ctx, input)
	})
}

func (observed *ObservedStore) TeamActivity(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (store.TeamActivityProjection, error) {
	return observeValue(observed.metrics, "social_projection", func() (store.TeamActivityProjection, error) {
		return observed.Store.TeamActivity(ctx, actor, teamID, now)
	})
}

func (observed *ObservedStore) Leaderboard(ctx context.Context, actor domain.Actor, teamID string, period domain.LeaderboardPeriod, metric domain.LeaderboardMetric, now time.Time) (store.LeaderboardProjection, error) {
	return observeValue(observed.metrics, "social_projection", func() (store.LeaderboardProjection, error) {
		return observed.Store.Leaderboard(ctx, actor, teamID, period, metric, now)
	})
}

func (observed *ObservedStore) TrainingDashboard(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (store.TrainingDashboardProjection, error) {
	return observeValue(observed.metrics, "social_projection", func() (store.TrainingDashboardProjection, error) {
		return observed.Store.TrainingDashboard(ctx, actor, teamID, now)
	})
}

func (observed *ObservedStore) UpdatePlayerAvatarConfiguration(ctx context.Context, playerID, configuration string) error {
	return observeError(observed.metrics, "avatar", func() error {
		return observed.Store.UpdatePlayerAvatarConfiguration(ctx, playerID, configuration)
	})
}

func observeValue[T any](metrics *Metrics, operation string, run func() (T, error)) (T, error) {
	started := time.Now()
	value, err := run()
	metrics.ObserveSQLite(operation, operationOutcome(err), time.Since(started).Seconds())
	return value, err
}

func observeError(metrics *Metrics, operation string, run func() error) error {
	started := time.Now()
	err := run()
	metrics.ObserveSQLite(operation, operationOutcome(err), time.Since(started).Seconds())
	return err
}

func operationOutcome(err error) string {
	if err == nil {
		return "success"
	}
	return "error"
}
