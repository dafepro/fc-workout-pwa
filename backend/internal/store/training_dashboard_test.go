package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTrainingDashboardReturnsOwnedCatalogAssignmentAndSafeSummary(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)

	projection, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Team.Name != "Trailblazers" || projection.Team.WeeklyGoal != 3 {
		t.Fatalf("unexpected team: %+v", projection.Team)
	}
	if len(projection.Activities) != 4 || projection.Activities[0].ID != "distance-run" {
		t.Fatalf("unexpected activity catalog: %+v", projection.Activities)
	}
	if projection.Activities[0].MinimumValue != .25 || projection.Activities[0].StepValue != .25 || projection.Activities[0].DefaultValue != 1 {
		t.Fatalf("distance activity should use kid-legible quarter-mile defaults: %+v", projection.Activities[0])
	}
	if projection.CurrentAssignment == nil || projection.CurrentAssignment.ID != "assignment-hills" || projection.CurrentAssignment.Completed {
		t.Fatalf("unexpected assignment: %+v", projection.CurrentAssignment)
	}
	if projection.Summary.WeeklySessions != 1 || projection.Summary.Rolling30Sessions != 1 || projection.Summary.LongestStreak != 1 {
		t.Fatalf("unexpected personal summary: %+v", projection.Summary)
	}
	if projection.Summary.WeeklyMomentumCredits != 1 {
		t.Fatalf("unexpected weekly Momentum credit: %+v", projection.Summary)
	}
	if projection.TeamPulse.ActiveThisWeek != 2 {
		t.Fatalf("team pulse included an inactive member: %+v", projection.TeamPulse)
	}
	if !projection.TeamPulse.Unlocked || len(projection.TeamPulse.RecentActivities) != 3 {
		t.Fatalf("unexpected recent Team pulse: %+v", projection.TeamPulse)
	}
	for index, activity := range projection.TeamPulse.RecentActivities {
		if activity.PlayerID != "player-ava" || activity.FirstName != "Ava" || activity.LastInitial != "R" || activity.ActivityName != "Hill Sprints" {
			t.Fatalf("unsafe or unexpected pulse item %d: %+v", index, activity)
		}
	}
	if projection.TeamPulse.RecentActivities[0].Recency != "Today" || projection.TeamPulse.RecentActivities[2].Recency != "Yesterday" {
		t.Fatalf("recent Team pulse exposed the wrong recency: %+v", projection.TeamPulse.RecentActivities)
	}
	if projection.StreakComparison.TemplateKey == "" || projection.StreakComparison.Value == "" {
		t.Fatalf("server must choose a streak comparison: %+v", projection.StreakComparison)
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, privateField := range []string{"exhaustionLevel", "resultValue", "occurredAt", "entry-ava-one", "player-former"} {
		if strings.Contains(string(encoded), privateField) {
			t.Fatalf("dashboard leaked %q: %s", privateField, encoded)
		}
	}
}

func TestTrainingDashboardKeepsRecentTeamActivityBehindTodaysGate(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries SET occurred_at = '2026-08-11T12:00:00Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.TeamPulse.Unlocked || len(projection.TeamPulse.RecentActivities) != 0 {
		t.Fatalf("locked dashboard exposed Team activity: %+v", projection.TeamPulse)
	}
}

func TestTrainingDashboardScopesAssignmentCompletionToTheTeamDay(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}

	if _, err := db.ExecContext(ctx, `UPDATE training_entries
		SET assignment_id = 'assignment-hills', occurred_at = '2026-08-12T04:59:59Z'
		WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentAssignment == nil || projection.CurrentAssignment.Completed {
		t.Fatalf("a prior team-day entry completed today's assignment: %+v", projection.CurrentAssignment)
	}

	if _, err := db.ExecContext(ctx, `UPDATE training_entries
		SET occurred_at = '2026-08-12T05:00:00.000Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	projection, err = repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentAssignment == nil || !projection.CurrentAssignment.Completed {
		t.Fatalf("a current team-day entry did not complete today's assignment: %+v", projection.CurrentAssignment)
	}

	if _, err := db.ExecContext(ctx, `UPDATE training_entries
		SET occurred_at = '2026-08-13T05:00:00.000Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	projection, err = repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentAssignment == nil || projection.CurrentAssignment.Completed {
		t.Fatalf("the next team-day boundary completed today's assignment: %+v", projection.CurrentAssignment)
	}
}

func TestTrainingDashboardCountsPlannedRestOnceTowardWeeklyMomentum(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	if _, err := db.ExecContext(ctx, `UPDATE training_entries SET occurred_at = '2026-08-11T12:00:00Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Summary.WeeklyMomentumCredits != 1 {
		t.Fatalf("training credit = %d", projection.Summary.WeeklyMomentumCredits)
	}

	if _, err := db.ExecContext(ctx, `INSERT INTO team_canvas_rest_days
		(team_id, player_id, day_key, created_at) VALUES
		('team-one', 'player-mason', '2026-08-11', '2026-08-11T12:00:00Z'),
		('team-one', 'player-mason', '2026-08-12', '2026-08-12T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	projection, err = repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Summary.WeeklyMomentumCredits != 2 {
		t.Fatalf("training plus one distinct rest day = %d", projection.Summary.WeeklyMomentumCredits)
	}
	if !projection.TeamPulse.Unlocked || len(projection.TeamPulse.RecentActivities) == 0 {
		t.Fatalf("submitted planned rest did not unlock Team pulse: %+v", projection.TeamPulse)
	}
}

func TestTrainingDashboardRejectsUnrelatedPlayer(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	_, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-outsider", ClubID: "club-one",
	}, "team-one", now)
	if !errors.Is(err, store.ErrTrainingDashboardUnavailable) {
		t.Fatalf("error = %v", err)
	}
}
