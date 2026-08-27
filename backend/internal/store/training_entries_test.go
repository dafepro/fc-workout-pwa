package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestCreateTrainingEntryUsesTheTeamsCalendarForMembership(t *testing.T) {
	_, db := socialProjectionStore(t)
	seedSocialProjection(t, db, time.Date(2026, time.August, 8, 1, 30, 0, 0, time.UTC))
	if _, err := db.Exec(`UPDATE teams SET time_zone = 'UTC' WHERE id = 'team-one'`); err != nil {
		t.Fatal(err)
	}
	legacyLocation, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, legacyLocation)
	if _, err := db.Exec(`INSERT INTO players (
		id, club_id, first_name, last_initial, avatar_configuration_json, created_at
	) VALUES ('player-new', 'club-one', 'New', 'P', '{}', '2026-08-08T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO team_memberships (
		team_id, player_id, active_from
	) VALUES ('team-one', 'player-new', '2026-08-08')`); err != nil {
		t.Fatal(err)
	}

	occurredAt := time.Date(2026, time.August, 8, 0, 30, 0, 0, time.UTC)
	entry, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID:       "player-new",
		IdempotencyKey: "new-player-first-entry",
		Request: store.TrainingEntryRequest{
			TeamID:               "team-one",
			ActivityDefinitionID: "hill-sprints",
			OccurredAt:           occurredAt.Format(time.RFC3339),
			Result:               store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
			EffortLevel:          4,
			ExhaustionLevel:      3,
		},
		Now: occurredAt.Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("create entry for active team-local membership: %v", err)
	}
	if entry.TeamID != "team-one" || entry.PlayerID != "player-new" {
		t.Fatalf("unexpected entry: %+v", entry)
	}
}

func TestCreateTrainingEntryPersistsOnlyApprovedCompletionOutcomes(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	input := store.CreateTrainingEntryInput{
		PlayerID:       "player-mason",
		IdempotencyKey: "partial-entry",
		Request: store.TrainingEntryRequest{
			TeamID:               "team-one",
			ActivityDefinitionID: "hill-sprints",
			OccurredAt:           now.Add(-time.Hour).Format(time.RFC3339),
			Result:               store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
			EffortLevel:          4,
			ExhaustionLevel:      3,
			CompletionOutcome:    "partial",
		},
		Now: now,
	}

	created, err := repository.CreateTrainingEntry(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if created.CompletionOutcome != "partial" {
		t.Fatalf("completion outcome = %q, want partial", created.CompletionOutcome)
	}
	replayed, err := repository.CreateTrainingEntry(context.Background(), input)
	if err != nil || !replayed.Replayed || replayed.CompletionOutcome != "partial" {
		t.Fatalf("unexpected replay: entry=%+v err=%v", replayed, err)
	}

	input.IdempotencyKey = "invalid-outcome"
	input.Request.CompletionOutcome = "maximized"
	if _, err = repository.CreateTrainingEntry(context.Background(), input); !errors.Is(err, store.ErrEntryOutcomeNotAllowed) {
		t.Fatalf("invalid outcome error = %v, want ErrEntryOutcomeNotAllowed", err)
	}
}
