package store_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestCreateTrainingEntryRequiresExactPublishedPlanBlockProvenance(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	plan, err := store.NewStaffStore(db).PublishTrainingPlan(context.Background(), "team-one", store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1", StartsOn: "2026-08-12",
	})
	if err != nil {
		t.Fatal(err)
	}
	request := store.TrainingEntryRequest{
		TeamID: "team-one", ActivityDefinitionID: "hill-sprints",
		OccurredAt:  now.Format(time.RFC3339),
		Result:      store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
		EffortLevel: 4, ExhaustionLevel: 3,
		Plan: &store.TrainingPlanProvenance{PlanID: plan.ID, DayIndex: 0, BlockIndex: 0},
	}

	entry, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "exact-plan-block", Request: request, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if entry.Plan == nil || *entry.Plan != *request.Plan {
		t.Fatalf("plan provenance was not preserved: %+v", entry.Plan)
	}

	request.Plan = &store.TrainingPlanProvenance{PlanID: plan.ID, DayIndex: 1, BlockIndex: 0}
	_, err = repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "wrong-plan-day", Request: request, Now: now,
	})
	if !errors.Is(err, store.ErrEntryPlanUnavailable) {
		t.Fatalf("wrong plan day error = %v", err)
	}

	projection, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentPlanDay == nil || !projection.CurrentPlanDay.Blocks[0].Completed || !projection.CurrentPlanDay.Completed {
		t.Fatalf("exact plan entry did not complete its block: %+v", projection.CurrentPlanDay)
	}
	if _, err = repository.DeleteTrainingEntry(context.Background(), entry.ID, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	projection, err = repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentPlanDay.Completed || projection.CurrentPlanDay.Blocks[0].Completed {
		t.Fatalf("deleted entry still completed the plan: %+v", projection.CurrentPlanDay)
	}
}

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

func TestTrainingCheckInsLatchOneLoungePlacementCreditPerTeamDay(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	request := store.TrainingEntryRequest{
		TeamID: "team-one", ActivityDefinitionID: "hill-sprints",
		OccurredAt:  now.Format(time.RFC3339),
		Result:      store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
		EffortLevel: 4, ExhaustionLevel: 3,
	}
	first, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "lounge-credit-one", Request: request, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "lounge-credit-same-day", Request: request, Now: now,
	}); err != nil {
		t.Fatal(err)
	}
	request.OccurredAt = now.AddDate(0, 0, -1).Format(time.RFC3339)
	if _, err = repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "lounge-credit-yesterday", Request: request, Now: now,
	}); err != nil {
		t.Fatal(err)
	}

	var credits int
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_lounge_v2_placement_credits
		WHERE team_id = 'team-one' AND player_id = 'player-mason' AND week_key = '2026-08-10'`).Scan(&credits); err != nil {
		t.Fatal(err)
	}
	if credits != 2 {
		t.Fatalf("placement credits = %d, want one per distinct team day", credits)
	}
	if _, err = repository.DeleteTrainingEntry(context.Background(), first.ID, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_lounge_v2_placement_credits
		WHERE team_id = 'team-one' AND player_id = 'player-mason' AND week_key = '2026-08-10'`).Scan(&credits); err != nil {
		t.Fatal(err)
	}
	if credits != 2 {
		t.Fatalf("deleting an entry revoked a latched placement credit: %d", credits)
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

func TestCreateTrainingEntryCanonicalizesPrivateNoteAndOutcome(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	note := "  First set felt good.\r\nCalf tightened later.  "
	outcome := "partial"

	entry, err := repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "private-note", Now: now,
		Request: store.TrainingEntryRequest{
			TeamID: "team-one", ActivityDefinitionID: "hill-sprints",
			OccurredAt:  now.Format(time.RFC3339),
			Result:      store.TrainingResult{Kind: "repetitions", Value: 7, Unit: "reps"},
			EffortLevel: 4, ExhaustionLevel: 3, CompletionOutcome: outcome, Note: note,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if entry.CompletionOutcome != "partial" {
		t.Fatalf("completion outcome = %v", entry.CompletionOutcome)
	}
	if entry.Note != "First set felt good.\nCalf tightened later." {
		t.Fatalf("canonical note = %v", entry.Note)
	}

	loaded, err := repository.GetTrainingEntry(context.Background(), entry.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Note != entry.Note {
		t.Fatalf("stored note = %v", loaded.Note)
	}

	tooLong := strings.Repeat("a", 501)
	_, err = repository.CreateTrainingEntry(context.Background(), store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "note-too-long", Now: now,
		Request: store.TrainingEntryRequest{
			TeamID: "team-one", ActivityDefinitionID: "hill-sprints",
			OccurredAt:  now.Format(time.RFC3339),
			Result:      store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"},
			EffortLevel: 4, ExhaustionLevel: 3, Note: tooLong,
		},
	})
	if !errors.Is(err, store.ErrEntryDetailsNotAllowed) {
		t.Fatalf("long note error = %v", err)
	}
}
