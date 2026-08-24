package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func TestTrainingDashboardProjectsPublishedTrainingAndRestDays(t *testing.T) {
	for _, test := range []struct {
		name      string
		startsOn  string
		wantKind  string
		completed bool
	}{
		{name: "training activity", startsOn: "2026-08-12", wantKind: "training", completed: false},
		{name: "planned rest", startsOn: "2026-08-09", wantKind: "rest", completed: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			repository, db := socialProjectionStore(t)
			now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
			seedSocialProjection(t, db, now)
			if _, err := store.NewStaffStore(db).PublishTrainingPlan(context.Background(), "team-one", store.TrainingPlanInput{
				TemplateID: "in-season-balance-v1", StartsOn: test.startsOn,
			}); err != nil {
				t.Fatal(err)
			}

			projection, err := repository.TrainingDashboard(context.Background(), domain.Actor{
				Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
			}, "team-one", now)
			if err != nil {
				t.Fatal(err)
			}
			if projection.CurrentPlanDay == nil || projection.CurrentPlanDay.Kind != test.wantKind ||
				projection.CurrentPlanDay.Completed != test.completed {
				t.Fatalf("unexpected current plan day: %+v", projection.CurrentPlanDay)
			}
			if test.wantKind == "training" && (len(projection.CurrentPlanDay.Blocks) != 1 ||
				projection.CurrentPlanDay.Blocks[0].ActivityDefinitionID != "hill-sprints" ||
				projection.CurrentPlanDay.Blocks[0].Completed) {
				t.Fatalf("unexpected current plan blocks: %+v", projection.CurrentPlanDay.Blocks)
			}
		})
	}
}

func TestTrainingDashboardProjectsYesterdayTodayAndTomorrowFromOnePlan(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries SET occurred_at = '2026-08-11T12:00:00Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.NewStaffStore(db).PublishTrainingPlan(context.Background(), "team-one", store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1", StartsOn: "2026-08-11",
	}); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TrainingDashboard(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	window := projection.CurrentPlan
	if window == nil {
		t.Fatal("published plan did not produce a three-day window")
	}
	if window.TemplateName != "In-season balance" || window.DayNumber != 2 || window.DayCount != 7 {
		t.Fatalf("unexpected plan identity: %+v", window)
	}
	if window.Yesterday == nil || window.Yesterday.OccursOn != "2026-08-11" || window.Yesterday.Completed {
		t.Fatalf("unexpected yesterday: %+v", window.Yesterday)
	}
	if window.Today.OccursOn != "2026-08-12" || window.Today.Kind != "recovery" || window.Today.Completed {
		t.Fatalf("unexpected today: %+v", window.Today)
	}
	if window.Tomorrow == nil || window.Tomorrow.OccursOn != "2026-08-13" || window.Tomorrow.Kind != "training" || window.Tomorrow.Completed {
		t.Fatalf("unexpected tomorrow: %+v", window.Tomorrow)
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

func TestTrainingDashboardBuildsMomentumWithDiminishingDailyActivities(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	if _, err := db.ExecContext(ctx, `DELETE FROM training_entries WHERE player_id = 'player-mason'`); err != nil {
		t.Fatal(err)
	}

	wantScores := []float64{4, 5, 5.5, 5.5}
	for index, want := range wantScores {
		stamp := now.Add(-time.Duration(index+1) * time.Minute)
		if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) VALUES (?, 'player-mason', 'team-one', 'hill-sprints', ?, 8, 'reps', 3, 3, ?, ?)`,
			fmt.Sprintf("momentum-entry-%d", index), stamp.Format(time.RFC3339Nano),
			stamp.Format(time.RFC3339Nano), stamp.Add(24*time.Hour).Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
		projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
		if err != nil {
			t.Fatal(err)
		}
		if projection.Summary.MomentumScore != want {
			t.Fatalf("%d same-day activities produced Momentum %v, want %v", index+1, projection.Summary.MomentumScore, want)
		}
		if projection.Summary.WeeklyMomentumCredits != 1 {
			t.Fatalf("%d same-day activities produced %d weekly check-ins, want 1", index+1, projection.Summary.WeeklyMomentumCredits)
		}
	}
}

func TestTrainingDashboardCheckInStreakIncludesPlannedRest(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	if _, err := db.ExecContext(ctx, `UPDATE training_entries SET occurred_at = '2026-08-10T12:00:00Z' WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES ('momentum-bonus', 'player-mason', 'team-one', 'distance-run',
		'2026-08-11T12:00:00Z', 1, 'miles', 3, 3, '2026-08-11T12:00:00Z', '2026-08-12T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO team_canvas_rest_days
		(team_id, player_id, day_key, created_at) VALUES
		('team-one', 'player-mason', '2026-08-09', '2026-08-09T12:00:00Z'),
		('team-one', 'player-mason', '2026-08-12', '2026-08-12T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Summary.CurrentCheckInStreak != 4 {
		t.Fatalf("check-in streak = %d, want 4", projection.Summary.CurrentCheckInStreak)
	}
	if projection.Summary.MomentumScore != 16 {
		t.Fatalf("four recent check-in days produced Momentum %v, want 16", projection.Summary.MomentumScore)
	}
	if projection.Summary.WeeklyMomentumCredits != 3 {
		t.Fatalf("weekly check-ins included an older rest day: %d", projection.Summary.WeeklyMomentumCredits)
	}
}

func TestTrainingDashboardMomentumFadesOldCheckInsWithoutAMissedDayPenalty(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	if _, err := db.ExecContext(ctx, `DELETE FROM training_entries WHERE player_id = 'player-mason'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE teams SET created_at = '2026-05-01T00:00:00Z' WHERE id = 'team-one'`); err != nil {
		t.Fatal(err)
	}
	for index, age := range []int{0, 28, 55, 56} {
		stamp := now.AddDate(0, 0, -age)
		if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) VALUES (?, 'player-mason', 'team-one', 'hill-sprints', ?, 8, 'reps', 3, 3, ?, ?)`,
			fmt.Sprintf("aged-momentum-entry-%d", index), stamp.Format(time.RFC3339Nano),
			stamp.Format(time.RFC3339Nano), stamp.Add(24*time.Hour).Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
	}

	projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Summary.MomentumScore != 8.1 {
		t.Fatalf("Momentum score = %v, want 8.1 from recent and gently aged check-ins", projection.Summary.MomentumScore)
	}
}

func TestTrainingDashboardMomentumUsesTeamDaysAndIgnoresDeletedEntries(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 6, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	if _, err := db.ExecContext(ctx, `DELETE FROM training_entries WHERE player_id = 'player-mason'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES ('before-local-midnight', 'player-mason', 'team-one', 'hill-sprints',
		'2026-08-12T04:59:59Z', 8, 'reps', 3, 3, '2026-08-12T04:59:59Z', '2026-08-13T04:59:59Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until, deleted_at
	) VALUES ('deleted-after-local-midnight', 'player-mason', 'team-one', 'hill-sprints',
		'2026-08-12T05:00:00Z', 8, 'reps', 3, 3, '2026-08-12T05:00:00Z',
		'2026-08-13T05:00:00Z', '2026-08-12T05:30:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO team_canvas_rest_days
		(team_id, player_id, day_key, created_at) VALUES
		('team-one', 'player-mason', '2026-08-10', '2026-08-10T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TrainingDashboard(ctx, actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Summary.CurrentCheckInStreak != 2 {
		t.Fatalf("team-local check-in streak = %d, want 2", projection.Summary.CurrentCheckInStreak)
	}
	if projection.Summary.MomentumScore != 8 {
		t.Fatalf("Momentum score = %v, want 8", projection.Summary.MomentumScore)
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
