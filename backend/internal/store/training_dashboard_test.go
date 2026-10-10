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

func TestTeamAccessUsesExactTrainingInstants(t *testing.T) {
	second := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	for _, fixture := range []struct {
		name, zone, outcome, stamp string
		occurredAt, now            time.Time
		deleted, unlocked          bool
	}{
		{name: "whole second before fractional now", occurredAt: second, now: second.Add(100 * time.Millisecond), unlocked: true},
		{name: "fractional now before next whole second", occurredAt: second.Add(500 * time.Millisecond), now: second.Add(100 * time.Millisecond)},
		{name: "exact now", occurredAt: second.Add(time.Nanosecond), now: second.Add(time.Nanosecond), unlocked: true},
		{name: "fractional future at whole-second now", occurredAt: second.Add(time.Nanosecond), now: second},
		{name: "one nanosecond in the future", occurredAt: second.Add(2 * time.Nanosecond), now: second.Add(time.Nanosecond)},
		{name: "next whole second", occurredAt: second.Add(time.Second), now: second.Add(100 * time.Millisecond)},
		{name: "fractional team midnight", occurredAt: second.Add(-13*time.Hour + 100*time.Millisecond), now: second, unlocked: true},
		{name: "exact team midnight", occurredAt: second.Add(-13 * time.Hour), now: second, unlocked: true},
		{name: "one nanosecond before team midnight", occurredAt: second.Add(-13*time.Hour - time.Nanosecond), now: second},
		{name: "partial", occurredAt: second, now: second.Add(100 * time.Millisecond), outcome: "partial"},
		{name: "deleted", occurredAt: second, now: second.Add(100 * time.Millisecond), deleted: true},
		{name: "positive offset team midnight", zone: "Asia/Tokyo", occurredAt: second.Add(-3*time.Hour + time.Nanosecond), now: second, unlocked: true},
		{name: "before positive offset team midnight", zone: "Asia/Tokyo", occurredAt: second.Add(-3*time.Hour - time.Nanosecond), now: second},
		{name: "legacy negative offset midnight", stamp: "2026-08-12T00:00:00-05:00", now: second, unlocked: true},
		{name: "legacy positive offset midnight", zone: "Asia/Tokyo", stamp: "2026-08-13T00:00:00+09:00", now: second, unlocked: true},
		{name: "legacy offset future", stamp: "2026-08-12T13:00:00.000000001-05:00", now: second},
		{name: "legacy offset prior day", zone: "Asia/Tokyo", stamp: "2026-08-12T23:59:59.999999999+09:00", now: second},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			repository, db := socialProjectionStore(t)
			seedSocialProjection(t, db, fixture.now)
			if fixture.zone != "" {
				if _, err := db.Exec(`UPDATE teams SET time_zone = ? WHERE id = 'team-one'`, fixture.zone); err != nil {
					t.Fatal(err)
				}
			}
			var outcome, deletedAt any
			if fixture.outcome != "" {
				outcome = fixture.outcome
			}
			if fixture.deleted {
				deletedAt = fixture.now.UTC().Format(time.RFC3339Nano)
			}
			stamp := fixture.stamp
			if stamp == "" {
				stamp = fixture.occurredAt.UTC().Format(time.RFC3339Nano)
			}
			if _, err := db.Exec(`UPDATE training_entries SET occurred_at = ?, completion_outcome = ?, deleted_at = ? WHERE id = 'entry-mason'`,
				stamp, outcome, deletedAt); err != nil {
				t.Fatal(err)
			}
			actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
			dashboard, err := repository.TrainingDashboard(context.Background(), actor, "team-one", fixture.now)
			if err != nil {
				t.Fatal(err)
			}
			if dashboard.TeamPulse.Unlocked != fixture.unlocked {
				t.Fatalf("dashboard unlocked = %v, want %v", dashboard.TeamPulse.Unlocked, fixture.unlocked)
			}
			hub, err := repository.TeamHub(context.Background(), actor, "team-one", fixture.now)
			if err != nil {
				t.Fatal(err)
			}
			if hub.Access.LoungeUnlocked != fixture.unlocked || hub.Access.ActivityUnlocked != fixture.unlocked {
				t.Fatalf("Team access = %+v, want unlocked %v", hub.Access, fixture.unlocked)
			}
		})
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

func TestPersonalDaysAndTeamSessionsStayDistinctThroughDeletionAndRollover(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	for _, id := range []string{"entry-extra-one", "entry-extra-two"} {
		if _, err := db.Exec(`INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) SELECT ?, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		FROM training_entries WHERE id = 'entry-mason'`, id); err != nil {
			t.Fatal(err)
		}
	}
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	check := func(at time.Time, sessions, days int) {
		t.Helper()
		dashboard, err := repository.TrainingDashboard(ctx, actor, "team-one", at)
		if err != nil {
			t.Fatal(err)
		}
		if dashboard.Summary.WeeklySessions != sessions || dashboard.Summary.WeeklyMomentumCredits != days {
			t.Fatalf("personal summary = %+v, want %d sessions / %d days", dashboard.Summary, sessions, days)
		}
		team, err := repository.TeamActivity(ctx, actor, "team-one", at)
		if err != nil {
			t.Fatal(err)
		}
		for _, member := range team.Members {
			if member.PlayerID == actor.PlayerID {
				if member.WeeklySessions != sessions || (member.GoalStatus == "completed") != (sessions >= team.Team.WeeklyGoal) {
					t.Fatalf("Team session goal = %+v, want %d sessions", member, sessions)
				}
				return
			}
		}
		t.Fatal("current player absent from Team projection")
	}
	check(now, 3, 1)
	check(time.Date(2026, time.August, 17, 5, 0, 0, 0, time.UTC), 0, 0)
	for index, id := range []string{"entry-extra-one", "entry-extra-two", "entry-mason"} {
		deleted, err := repository.DeleteTrainingEntry(ctx, id, now)
		if err != nil || !deleted {
			t.Fatalf("delete %s = %v, %v", id, deleted, err)
		}
		days := 1
		if index == 2 {
			days = 0
		}
		check(now, 2-index, days)
	}
}
