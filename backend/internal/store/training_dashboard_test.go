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
	if projection.TeamPulse.ActiveThisWeek != 2 {
		t.Fatalf("team pulse included an inactive member: %+v", projection.TeamPulse)
	}
	if projection.StreakComparison.TemplateKey == "" || projection.StreakComparison.Value == "" {
		t.Fatalf("server must choose a streak comparison: %+v", projection.StreakComparison)
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, requiredField := range []string{`"momentumScore":4`, `"currentCheckInStreak":1`} {
		if !strings.Contains(string(encoded), requiredField) {
			t.Fatalf("dashboard missing %q: %s", requiredField, encoded)
		}
	}
	for _, privateField := range []string{"exhaustionLevel", "resultValue", "player-ava"} {
		if strings.Contains(string(encoded), privateField) {
			t.Fatalf("dashboard leaked %q: %s", privateField, encoded)
		}
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
