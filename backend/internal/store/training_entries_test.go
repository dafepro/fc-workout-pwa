package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestCreateTrainingEntryUsesTheTeamDayDespiteClientClockSkew(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 13, 4, 30, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	request := store.TrainingEntryRequest{
		TeamID:               "team-one",
		ActivityDefinitionID: "hill-sprints",
		OccurredAt:           now.Add(29 * time.Minute).Format(time.RFC3339),
		Result:               store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
		EffortLevel:          4,
		ExhaustionLevel:      3,
	}

	if _, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "same-team-day-skew", Request: request, Now: now,
	}); err != nil {
		t.Fatalf("same team-day clock skew was rejected: %v", err)
	}

	request.OccurredAt = now.Add(31 * time.Minute).Format(time.RFC3339)
	_, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "next-team-day", Request: request, Now: now,
	})
	if !errors.Is(err, store.ErrEntryDateNotAllowed) {
		t.Fatalf("next team-day error = %v", err)
	}
}

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
