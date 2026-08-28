package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPublishTeamRewardIsCatalogBoundedAndIdempotent(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()
	seedTeamRewardCoach(t, db)
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	input := store.PublishTeamRewardInput{
		DefinitionID: "team-celebration-v1", StartsOn: "2026-08-20", EndsOn: "2026-08-22",
		RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "publish-one", Now: now,
	}

	published, err := staff.PublishTeamReward(ctx, "account-reward-coach", teamID, input)
	if err != nil {
		t.Fatal(err)
	}
	if published.DefinitionVersion != 1 || published.Title != "Team celebration" ||
		published.ArtworkID != "celebration-stars" || published.Status != "active" {
		t.Fatalf("published reward = %+v", published)
	}
	replayed, err := staff.PublishTeamReward(ctx, "account-reward-coach", teamID, input)
	if err != nil || !replayed.Replayed || replayed.ID != published.ID {
		t.Fatalf("replayed reward = %+v, err=%v", replayed, err)
	}

	changed := input
	changed.RequiredDays = 1
	if _, err = staff.PublishTeamReward(ctx, "account-reward-coach", teamID, changed); !errors.Is(err, store.ErrTeamRewardIdempotencyConflict) {
		t.Fatalf("changed replay error = %v", err)
	}
	changed.IdempotencyKey = "publish-two"
	if _, err = staff.PublishTeamReward(ctx, "account-reward-coach", teamID, changed); !errors.Is(err, store.ErrTeamRewardActive) {
		t.Fatalf("second active reward error = %v", err)
	}

	for _, invalid := range []store.PublishTeamRewardInput{
		{DefinitionID: "custom-copy", StartsOn: "2026-08-20", EndsOn: "2026-08-22", RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "invalid-1", Now: now},
		{DefinitionID: "team-celebration-v1", StartsOn: "2026-08-20", EndsOn: "2026-09-20", RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "invalid-2", Now: now},
		{DefinitionID: "team-celebration-v1", StartsOn: "2026-08-20", EndsOn: "2026-08-22", RequiredDays: 4, MinimumRosterPercent: 60, IdempotencyKey: "invalid-3", Now: now},
	} {
		if _, invalidErr := staff.PublishTeamReward(ctx, "account-reward-coach", teamID, invalid); !errors.Is(invalidErr, store.ErrStaffInvalid) {
			t.Fatalf("invalid input %+v error = %v", invalid, invalidErr)
		}
	}
}

func TestTeamRewardCountsAppropriatePlanParticipationWithoutPlayerDetails(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()
	seedTeamRewardCoach(t, db)
	now := time.Date(2026, time.August, 21, 18, 0, 0, 0, time.UTC)
	plan, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1", StartsOn: "2026-08-20",
	})
	if err != nil {
		t.Fatal(err)
	}
	reward, err := staff.PublishTeamReward(ctx, "account-reward-coach", teamID, store.PublishTeamRewardInput{
		DefinitionID: "team-celebration-v1", StartsOn: "2026-08-20", EndsOn: "2026-08-23",
		RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "progress", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	seedRewardPlanEntry(t, db, "entry-one", "player-met", teamID, plan.ID, 0, "hill-sprints", "as_listed", "2026-08-20T12:00:00Z")
	seedRewardPlanEntry(t, db, "entry-duplicate", "player-met", teamID, plan.ID, 0, "hill-sprints", "extra", "2026-08-20T13:00:00Z")
	seedRewardPlanEntry(t, db, "entry-two", "player-started", teamID, plan.ID, 0, "hill-sprints", "as_listed", "2026-08-20T14:00:00Z")
	seedRewardPlanEntry(t, db, "entry-day-two", "player-met", teamID, plan.ID, 1, "recovery-walk-jog", "as_listed", "2026-08-21T12:00:00Z")
	seedRewardPlanEntry(t, db, "entry-partial", "player-started", teamID, plan.ID, 1, "recovery-walk-jog", "partial", "2026-08-21T13:00:00Z")

	projection, err := staff.TeamReward(ctx, teamID, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Progress.Current != 1 || projection.Progress.Target != 2 || projection.Status != "active" {
		t.Fatalf("partial progress = %+v", projection)
	}
	if len(projection.Progress.Days) != 2 || projection.Progress.Days[0].ActivePlayers != 3 ||
		projection.Progress.Days[0].QualifyingPlayers != 2 || projection.Progress.Days[1].QualifyingPlayers != 1 {
		t.Fatalf("aggregate days = %+v", projection.Progress.Days)
	}

	for _, statement := range []string{
		`INSERT INTO planned_rest_check_ins (
		 id, player_id, team_id, training_plan_id, training_plan_day_index,
		 occurs_on, idempotency_key, created_at
		) VALUES ('rest-one', 'player-met', 'team-assignments', ?, 3, '2026-08-23',
		 'rest-one', '2026-08-23T12:00:00Z')`,
		`INSERT INTO planned_rest_check_ins (
		 id, player_id, team_id, training_plan_id, training_plan_day_index,
		 occurs_on, idempotency_key, created_at
		) VALUES ('rest-two', 'player-started', 'team-assignments', ?, 3, '2026-08-23',
		 'rest-two', '2026-08-23T12:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement, plan.ID); err != nil {
			t.Fatal(err)
		}
	}
	playerStore := store.New(db, time.UTC)
	asPlayer, err := playerStore.TeamReward(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-met", ClubID: "club-assignments",
	}, teamID, time.Date(2026, time.August, 23, 18, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if asPlayer.ID != reward.ID || asPlayer.Status != "achieved" || !asPlayer.Progress.Achieved {
		t.Fatalf("achieved player projection = %+v", asPlayer)
	}
	var achievedEvents int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_reward_events
		WHERE reward_id = ? AND event_type = 'achieved'`, reward.ID).Scan(&achievedEvents); err != nil {
		t.Fatal(err)
	}
	if achievedEvents != 1 {
		t.Fatalf("achieved events = %d, want one", achievedEvents)
	}
	if _, err = playerStore.TeamReward(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-outsider", ClubID: "club-assignments",
	}, teamID, now); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("outsider error = %v", err)
	}
}

func TestCancelTeamRewardPreservesHistoryAndRejectsStaleState(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()
	seedTeamRewardCoach(t, db)
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	published, err := staff.PublishTeamReward(ctx, "account-reward-coach", teamID, store.PublishTeamRewardInput{
		DefinitionID: "team-celebration-v1", StartsOn: "2026-08-20", EndsOn: "2026-08-22",
		RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "cancel", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	cancelled, err := staff.CancelTeamReward(ctx, "account-reward-coach", teamID, published.ID, now.Add(time.Hour))
	if err != nil || cancelled.Status != "cancelled" || cancelled.CancelledAt == "" {
		t.Fatalf("cancelled = %+v, err=%v", cancelled, err)
	}
	if _, err = staff.CancelTeamReward(ctx, "account-reward-coach", teamID, published.ID, now.Add(2*time.Hour)); !errors.Is(err, store.ErrTeamRewardState) {
		t.Fatalf("second cancellation error = %v", err)
	}
	if _, err = staff.TeamReward(ctx, teamID, now); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("cancelled reward remained visible: %v", err)
	}
}

func seedTeamRewardCoach(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), `INSERT INTO accounts (
		id, club_id, role, status, created_at
	) VALUES ('account-reward-coach', 'club-assignments', 'coach', 'active', '2026-08-20T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
}

func seedRewardPlanEntry(t *testing.T, db *sql.DB, id, playerID, teamID, planID string, dayIndex int, activityID, outcome, occurredAt string) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until,
		training_plan_id, training_plan_day_index, training_plan_block_index, completion_outcome
	) VALUES (?, ?, ?, ?, ?, 15, 'minutes', 3, 3, ?,
		'2026-08-30T00:00:00Z', ?, ?, 0, ?)`, id, playerID, teamID, activityID,
		occurredAt, occurredAt, planID, dayIndex, outcome); err != nil {
		t.Fatal(err)
	}
}
