package store_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

// The browser suite reads Mason's weekly count off the goal card, so the two
// seeded sessions have to land inside the team-local week whatever day the
// suite runs on. Monday is the day that used to lose one of them.
func TestResetE2EFixturesKeepsBothSessionsInTheLocalWeek(t *testing.T) {
	ctx := context.Background()
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, location)

	// 2026-08-10 is a Monday; the week that follows covers every weekday, and the
	// 01:00 local hour catches an entry that would fall back across midnight too.
	for day := range 7 {
		for _, localHour := range []int{1, 15} {
			now := time.Date(2026, time.August, 10+day, localHour, 0, 0, 0, location).UTC()
			label := now.In(location).Format("Mon 15:04")
			if err := repository.ResetE2EFixtures(ctx, now); err != nil {
				t.Fatalf("%s: %v", label, err)
			}
			projection, err := repository.TrainingDashboard(ctx, domain.Actor{
				Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-zoomigo",
			}, "team-hill-striders", now)
			if err != nil {
				t.Fatalf("%s: %v", label, err)
			}
			if projection.Summary.WeeklySessions != 2 {
				t.Fatalf("%s: weekly sessions %d, want 2", label, projection.Summary.WeeklySessions)
			}
			if projection.CurrentAssignment == nil || projection.CurrentAssignment.Completed {
				t.Fatalf("%s: unexpected assignment: %+v", label, projection.CurrentAssignment)
			}
		}
	}
}

func TestResetE2EFixturesClearsTeamLoungeV2State(t *testing.T) {
	ctx := context.Background()
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, location)
	now := time.Date(2026, time.August, 26, 14, 0, 0, 0, time.UTC)
	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}

	statements := []string{
		`INSERT INTO team_lounge_v2_room_bindings (room_id, team_id, week_key, canvas_id, canvas_version, created_at)
		 VALUES ('fixture-room', 'team-hill-striders', '2026-08-24', 'beach-boardwalk', 1, '2026-08-26T14:00:00Z')`,
		`INSERT INTO team_lounge_v2_snapshots (room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision, host_epoch, tick, normalized, captured_at, snapshot_json)
		 VALUES ('fixture-room', 'beach-boardwalk', 1, 1, 1, 1, 1, 1, '2026-08-26T14:00:00Z', '{"items":[]}')`,
		`INSERT INTO team_lounge_v2_weekly_visits (room_id, player_id, last_visited_at)
		 VALUES ('fixture-room', 'player-mason', '2026-08-26T14:00:00Z')`,
		`INSERT INTO team_lounge_v2_placement_credits (team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
		 VALUES ('team-hill-striders', 'player-mason', '2026-08-24', '2026-08-26', 'training_entry', 'fixture-entry', '2026-08-26T14:00:00Z')`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{
		"team_lounge_v2_weekly_visits",
		"team_lounge_v2_snapshots",
		"team_lounge_v2_room_bindings",
		"team_lounge_v2_placement_credits",
	} {
		var count int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s rows after reset = %d, want 0", table, count)
		}
	}
}
