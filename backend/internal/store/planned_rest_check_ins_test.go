package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPlannedRestCheckInCompletesOnlyTodaysPublishedRestDay(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`DELETE FROM training_entries WHERE player_id = 'player-mason'`); err != nil {
		t.Fatal(err)
	}
	plan, err := store.NewStaffStore(db).PublishTrainingPlan(context.Background(), "team-one", store.TrainingPlanInput{
		TemplateID: "speed-recovery-v1", StartsOn: "2026-08-09",
	})
	if err != nil {
		t.Fatal(err)
	}

	before, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if before.CurrentPlanDay == nil || before.CurrentPlanDay.Kind != "rest" || before.CurrentPlanDay.Completed {
		t.Fatalf("unexpected rest day before check-in: %+v", before.CurrentPlanDay)
	}

	input := store.CreatePlannedRestCheckInInput{
		PlayerID: "player-mason", TeamID: "team-one", PlanID: plan.ID, DayIndex: 3,
		IdempotencyKey: "rest-one", Now: now,
	}
	created, err := repository.CreatePlannedRestCheckIn(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if created.OccursOn != "2026-08-12" || created.Replayed {
		t.Fatalf("unexpected planned rest check-in: %+v", created)
	}
	replayed, err := repository.CreatePlannedRestCheckIn(context.Background(), input)
	if err != nil || !replayed.Replayed || replayed.ID != created.ID {
		t.Fatalf("same-key replay = %+v err=%v", replayed, err)
	}
	input.IdempotencyKey = "rest-second-request"
	dayReplay, err := repository.CreatePlannedRestCheckIn(context.Background(), input)
	if err != nil || !dayReplay.Replayed || dayReplay.ID != created.ID {
		t.Fatalf("same-day replay = %+v err=%v", dayReplay, err)
	}

	after, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if after.CurrentPlanDay == nil || !after.CurrentPlanDay.Completed {
		t.Fatalf("rest day remained incomplete: %+v", after.CurrentPlanDay)
	}
	if after.Summary.WeeklySessions != 0 || after.Summary.MomentumScore != 4 || after.Summary.CurrentCheckInStreak != 1 {
		t.Fatalf("planned rest summary = %+v", after.Summary)
	}

	input.IdempotencyKey = "wrong-plan-day"
	input.DayIndex = 2
	if _, err = repository.CreatePlannedRestCheckIn(context.Background(), input); !errors.Is(err, store.ErrPlannedRestUnavailable) {
		t.Fatalf("non-rest plan day error = %v", err)
	}
	input.IdempotencyKey = "rest-one"
	if _, err = repository.CreatePlannedRestCheckIn(context.Background(), input); !errors.Is(err, store.ErrPlannedRestIdempotencyConflict) {
		t.Fatalf("changed replay error = %v", err)
	}
}
