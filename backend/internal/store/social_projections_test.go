package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamActivityUsesActiveRosterAndSafeParticipationOnly(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)

	projection, err := repository.TeamActivity(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Team.ID != "team-one" || projection.Team.WeeklyGoal != 3 || projection.TeamSessions != 4 {
		t.Fatalf("unexpected team projection: %+v", projection)
	}
	if len(projection.Members) != 2 || projection.MembersMeetingGoal != 1 {
		t.Fatalf("unexpected active roster: %+v", projection.Members)
	}
	if projection.CurrentChallenge == nil || projection.CurrentChallenge.ID != "assignment-hills" || projection.CurrentChallenge.CompletedCount != 1 {
		t.Fatalf("unexpected challenge projection: %+v", projection.CurrentChallenge)
	}
	if projection.CurrentChallenge.ActivityName != "Hill Sprints" || projection.CurrentChallenge.TargetValue != 8 {
		t.Fatalf("unexpected safe challenge details: %+v", projection.CurrentChallenge)
	}
	if projection.Members[0].PlayerID != "player-ava" || projection.Members[0].WeeklySessions != 3 || projection.Members[0].GoalStatus != "completed" || !projection.Members[0].ChallengeCompleted {
		t.Fatalf("unexpected first member: %+v", projection.Members[0])
	}
	if projection.Members[1].ChallengeCompleted {
		t.Fatalf("incomplete member marked complete: %+v", projection.Members[1])
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	privateFields := []string{"resultValue", "resultUnit", "exhaustionLevel", "occurredAt", "assessment"}
	for _, field := range privateFields {
		if strings.Contains(string(encoded), field) {
			t.Fatalf("team projection leaked %q: %s", field, encoded)
		}
	}
}

func TestTeamActivityDoesNotPublishExplicitPartialAsChallengeCompletion(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries SET completion_outcome = 'partial'
		WHERE id = 'entry-ava-one'`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TeamActivity(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CurrentChallenge == nil || projection.CurrentChallenge.CompletedCount != 0 || projection.Members[0].ChallengeCompleted {
		t.Fatalf("partial result published as completion: %+v", projection)
	}
}

func TestLeaderboardSortsAuthoritativeSafeMetricsAndConcealsOtherTeams(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}

	projection, err := repository.Leaderboard(context.Background(), actor, "team-one", domain.PeriodWeekly, domain.MetricEffort, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.TeamSessions != 4 || projection.TeamEffortPoints != 43 {
		t.Fatalf("unexpected summary: %+v", projection)
	}
	if len(projection.Items) != 2 || projection.Items[0].PlayerID != "player-ava" || projection.Items[0].Rank != 1 || projection.Items[0].Value != 28 {
		t.Fatalf("unexpected ranking: %+v", projection.Items)
	}

	_, err = repository.TeamActivity(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-outsider", ClubID: "club-one",
	}, "team-one", now)
	if !errors.Is(err, store.ErrSocialTeamUnavailable) {
		t.Fatalf("unrelated player error = %v", err)
	}
}

func socialProjectionStore(t *testing.T) (*store.Store, *sql.DB) {
	t.Helper()
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "social.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	return store.New(db, time.UTC), db
}

func seedSocialProjection(t *testing.T, db *sql.DB, now time.Time) {
	t.Helper()
	ctx := context.Background()
	statements := []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'America/Chicago', '2026-08-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mason', 'club-one', 'Mason', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-ava', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-former', 'club-one', 'Former', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-outsider', 'club-one', 'Other', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-mason', '2026-01-01')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-ava', '2026-01-01')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from, active_to) VALUES ('team-one', 'player-former', '2026-01-01', '2026-08-01')`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO assignments (
		id, team_id, activity_definition_id, catalog_key, target_value, target_unit,
		starts_on, due_on, created_at
	) VALUES ('assignment-hills', 'team-one', 'hill-sprints', 'hill_sprints_8x6',
		8, 'reps', '2026-08-10', '2026-08-16', '2026-08-10T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	entries := []struct {
		id, playerID string
		when         time.Time
		effort       int
	}{
		{"entry-mason", "player-mason", now.Add(-2 * time.Hour), 5},
		{"entry-ava-one", "player-ava", now.Add(-3 * time.Hour), 7},
		{"entry-ava-two", "player-ava", now.Add(-4 * time.Hour), 2},
		{"entry-ava-yesterday", "player-ava", now.AddDate(0, 0, -1), 3},
		{"entry-former", "player-former", now.Add(-time.Hour), 7},
	}
	for _, entry := range entries {
		stamp := entry.when.UTC().Format(time.RFC3339Nano)
		if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) VALUES (?, ?, 'team-one', 'hill-sprints', ?, 8, 'reps', ?, 3, ?, ?)`,
			entry.id, entry.playerID, stamp, entry.effort, stamp, entry.when.Add(24*time.Hour).UTC().Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `UPDATE training_entries
		SET assignment_id = 'assignment-hills' WHERE id = 'entry-ava-one'`); err != nil {
		t.Fatal(err)
	}
}

// REQ-516. A coach reviews their own team from the same projection the players
// see, so the two screens cannot disagree about who met the weekly goal, and a
// coach with no claim on the team is refused it.
func TestTeamActivityServesTheAssignedCoachAndRefusesOthers(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()

	asPlayer, err := repository.TeamActivity(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}

	asCoach, err := repository.TeamActivity(ctx, domain.Actor{
		Role: domain.RoleCoach, AssignedTeamIDs: []string{"team-one"},
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if asCoach.MembersMeetingGoal != asPlayer.MembersMeetingGoal ||
		asCoach.TeamSessions != asPlayer.TeamSessions ||
		len(asCoach.Members) != len(asPlayer.Members) {
		t.Fatalf("coach and player disagree: coach=%+v player=%+v", asCoach, asPlayer)
	}

	if _, err = repository.TeamActivity(ctx, domain.Actor{
		Role: domain.RoleCoach, AssignedTeamIDs: []string{"team-two"},
	}, "team-one", now); !errors.Is(err, store.ErrSocialTeamUnavailable) {
		t.Fatalf("unassigned coach error = %v, want ErrSocialTeamUnavailable", err)
	}

	// The operator reads every club by design (F-O1), and repairing a team is
	// hard without being able to see it.
	if _, err = repository.TeamActivity(ctx, domain.Actor{
		Role: domain.RolePlatformAdmin,
	}, "team-one", now); err != nil {
		t.Fatalf("operator refused team progress: %v", err)
	}
}
