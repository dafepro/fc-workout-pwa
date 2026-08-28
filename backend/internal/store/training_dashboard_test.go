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
	if !projection.TeamPulse.Unlocked || projection.TeamPulse.ActiveThisWeek != 2 || len(projection.TeamPulse.RecentActivities) == 0 {
		t.Fatalf("accepted check-in did not unlock safe team pulse: %+v", projection.TeamPulse)
	}
	if projection.TeamPulse.RecentActivities[0].PlayerID != "player-ava" || projection.TeamPulse.RecentActivities[0].FirstName != "Ava" || projection.TeamPulse.RecentActivities[0].Recency != "Today" {
		t.Fatalf("unexpected safe team activity: %+v", projection.TeamPulse.RecentActivities)
	}
	encodedPulse, err := json.Marshal(projection.TeamPulse)
	if err != nil {
		t.Fatal(err)
	}
	for _, privateField := range []string{"occurredAt", "effortLevel", "completionOutcome"} {
		if strings.Contains(string(encodedPulse), privateField) {
			t.Fatalf("unlocked team pulse leaked %q: %s", privateField, encodedPulse)
		}
	}
	if _, err = db.Exec(`UPDATE training_entries SET assignment_id = 'assignment-hills',
		completion_outcome = 'partial' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	projection, err = repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentAssignment == nil || projection.CurrentAssignment.Completed {
		t.Fatalf("explicit partial result completed assignment: %+v", projection.CurrentAssignment)
	}
	if projection.Summary.WeeklySessions != 1 || projection.Summary.Rolling30Sessions != 1 || projection.Summary.LongestStreak != 1 {
		t.Fatalf("unexpected personal summary: %+v", projection.Summary)
	}
	if projection.Summary.MomentumScore != 4 || projection.Summary.CurrentCheckInStreak != 1 {
		t.Fatalf("unexpected Momentum projection: %+v", projection.Summary)
	}
	if projection.TeamPulse.Unlocked || projection.TeamPulse.ActiveThisWeek != 1 || len(projection.TeamPulse.RecentActivities) != 0 {
		t.Fatalf("partial workout unlocked team pulse or counted as completion: %+v", projection.TeamPulse)
	}
	if projection.StreakComparison.TemplateKey == "" || projection.StreakComparison.Value == "" {
		t.Fatalf("server must choose a streak comparison: %+v", projection.StreakComparison)
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, requiredField := range []string{`"weeklyMomentumCredits":1`, `"momentumScore":4`, `"currentCheckInStreak":1`} {
		if !strings.Contains(string(encoded), requiredField) {
			t.Fatalf("dashboard missing %q: %s", requiredField, encoded)
		}
	}
	for _, privateField := range []string{"exhaustionLevel", "resultValue", "effortLevel", "completionOutcome"} {
		if strings.Contains(string(encoded), privateField) {
			t.Fatalf("dashboard leaked %q: %s", privateField, encoded)
		}
	}
}

func TestTrainingDashboardPlannedRestUnlocksSafeTeamPulse(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries SET completion_outcome = 'partial'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO training_plans (
		id, team_id, template_id, template_version, template_name, template_summary,
		starts_on, ends_on, status, created_at
	) VALUES ('plan-rest', 'team-one', 'speed-reset', 1, 'Reset week', 'Safe recovery',
		'2026-08-12', '2026-08-12', 'published', '2026-08-12T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO training_plan_days (
		plan_id, day_index, occurs_on, kind, focus, duration_minutes, intensity
	) VALUES ('plan-rest', 0, '2026-08-12', 'rest', 'recovery', 0, 'easy')`); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, player := range []string{"player-mason", "player-ava"} {
		if _, err := repository.CreatePlannedRestCheckIn(ctx, store.CreatePlannedRestCheckInInput{
			PlayerID: player, TeamID: "team-one", PlanID: "plan-rest", DayIndex: 0,
			IdempotencyKey: "rest-" + player, Now: now,
		}); err != nil {
			t.Fatal(err)
		}
	}

	projection, err := repository.TrainingDashboard(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if !projection.TeamPulse.Unlocked || projection.TeamPulse.ActiveThisWeek != 2 {
		t.Fatalf("planned rest did not unlock and count team participation: %+v", projection.TeamPulse)
	}
	if projection.Summary.WeeklyMomentumCredits != 1 {
		t.Fatalf("workout and rest on one day should be one Momentum credit: %+v", projection.Summary)
	}
	if len(projection.TeamPulse.RecentActivities) != 1 || projection.TeamPulse.RecentActivities[0].ActivityName != "Planned rest" {
		t.Fatalf("planned rest was not projected as safe team activity: %+v", projection.TeamPulse.RecentActivities)
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
