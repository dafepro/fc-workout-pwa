package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestPrizeBoxMigrationEnforcesSealedOwnershipAndCanonicalLoungeKinds(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "prize-boxes.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO prize_boxes (
		 id, player_id, source, daily_day, daily_time_zone, catalog_version,
		 earned_at, earned_idempotency_key_hash
		) VALUES (
		 'box-one', 'player-one', 'daily_check_in', '2026-08-27', 'UTC', 1,
		 '2026-08-27T12:00:00Z', zeroblob(32)
		)`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO prize_boxes (
		id, player_id, source, daily_day, daily_time_zone, catalog_version,
		earned_at, earned_idempotency_key_hash
	) VALUES ('box-duplicate', 'player-one', 'daily_check_in', '2026-08-27', 'UTC', 1,
		'2026-08-27T13:00:00Z', randomblob(32))`); err == nil {
		t.Fatal("a player received two daily boxes on one day")
	}
	if _, err = db.ExecContext(ctx, `UPDATE prize_boxes SET item_kind = 'avatar_part',
		item_id = 'avatar-head-dog' WHERE id = 'box-one'`); err == nil {
		t.Fatal("a sealed box exposed an item before opening")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO player_unlocks (
		player_id, item_kind, item_id, source, unlocked_at
	) VALUES ('player-one', 'canvas_stamp', 'old-name', 'daily_check_in', '2026-08-27T12:00:00Z')`); err == nil {
		t.Fatal("abandoned Canvas inventory kind was accepted")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO player_unlocks (
		player_id, item_kind, item_id, source, unlocked_at
	) VALUES ('player-one', 'lounge_stamp', 'lounge-stamp-shield', 'daily_check_in', '2026-08-27T12:00:00Z')`); err != nil {
		t.Fatalf("canonical Team Lounge inventory kind: %v", err)
	}
}
