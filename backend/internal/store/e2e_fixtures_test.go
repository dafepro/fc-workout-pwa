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

func TestResetE2EFixturesClearsPrizeBoxesAndInventory(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "prize-fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, time.UTC)
	now := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)
	if err = repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	claimed, err := repository.ClaimDailyPrizeBox(ctx, store.ClaimDailyPrizeBoxInput{
		PlayerID: "player-mason", IdempotencyKey: "fixture-claim", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: claimed.Box.ID, IdempotencyKey: "fixture-open", Now: now,
	}); err != nil {
		t.Fatal(err)
	}

	if err = repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	overview, err := repository.PrizeBoxOverview(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if overview.EarnedTotal != 0 || overview.OpenedTotal != 0 || overview.ReadyCount != 0 {
		t.Fatalf("prize overview after reset = %+v", overview)
	}
	for _, kind := range []domain.PrizeItemKind{
		domain.PrizeAvatarPart, domain.PrizeLoungeStamp, domain.PrizeLoungeProp,
		domain.PrizeLoungeChatPack,
	} {
		items, listErr := repository.ListPlayerUnlocks(ctx, "player-mason", kind)
		if listErr != nil {
			t.Fatal(listErr)
		}
		if len(items) != 0 {
			t.Fatalf("%s inventory after reset = %+v", kind, items)
		}
	}
}

func TestResetE2EFixturesClearsTeamRewards(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "reward-fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, time.UTC)
	now := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)
	if err = repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('account-reward-coach', 'club-zoomigo', 'coach', 'active', '2026-08-27T12:00:00Z')`,
		`INSERT INTO team_rewards (
		 id, team_id, created_by_account_id, definition_id, definition_version,
		 prize_title, prize_description, artwork_id, status, starts_on, ends_on,
		 time_zone, rule_version, required_days, minimum_roster_percent,
		 publish_idempotency_key_hash, created_at, updated_at
		) VALUES (
		 'reward-fixture', 'team-hill-striders', 'account-reward-coach',
		 'team-celebration-v1', 1, 'Team celebration',
		 'Celebrate together at a future team gathering.', 'celebration-stars',
		 'active', '2026-08-27', '2026-09-03', 'UTC', 1, 5, 80,
		 zeroblob(32), '2026-08-27T12:00:00Z', '2026-08-27T12:00:00Z'
		)`,
		`INSERT INTO team_reward_events (id, reward_id, actor_account_id, event_type, occurred_at)
		 VALUES ('reward-event-fixture', 'reward-fixture', 'account-reward-coach',
		 'published', '2026-08-27T12:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if err = repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"team_rewards", "team_reward_events"} {
		var count int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s rows after reset = %d", table, count)
		}
	}
}

func TestResetE2EFixturesClearsCanonicalTeamLoungeState(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "lounge-fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, time.UTC)
	if err = repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}

	for _, statement := range []string{
		`INSERT INTO team_lounge_rooms (
			room_id, team_id, week_key, canvas_id, canvas_version, created_at
		) VALUES ('room-reset', 'team-hill-striders', '2026-08-24', 'canvas-reset', 1, '2026-08-26T18:00:00Z')`,
		`INSERT INTO team_lounge_snapshots (
			room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision,
			host_epoch, tick, normalized, captured_at, snapshot_json
		) VALUES ('room-reset', 'canvas-reset', 1, 0, 0, 0, 0, 1, '2026-08-26T18:00:00Z', '{}')`,
		`INSERT INTO team_lounge_visits (room_id, player_id, last_visited_at)
		 VALUES ('room-reset', 'player-mason', '2026-08-26T18:00:00Z')`,
		`INSERT INTO team_lounge_placement_credits (
			team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
		) VALUES (
			'team-hill-striders', 'player-mason', '2026-08-24', '2026-08-26',
			'training_entry', 'entry-mason-recent', '2026-08-26T18:00:00Z'
		)`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{
		"team_lounge_rooms", "team_lounge_snapshots", "team_lounge_visits", "team_lounge_placement_credits",
		"team_lounge_item_mutation_permits",
	} {
		var count int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s contains %d rows after reset", table, count)
		}
	}
}
