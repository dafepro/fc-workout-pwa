package database

import (
	"context"
	"io/fs"
	"path/filepath"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/migrations"
)

func TestMigrateUpgradesAnExistingFoundationDatabase(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "upgrade.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	foundation, err := fs.ReadFile(migrations.Files, "000001_foundation.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(foundation)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-08-05T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("upgrade migration: %v", err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("idempotent migration replay: %v", err)
	}

	var columnCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('reactions') WHERE name = 'remaining_after_send'`).Scan(&columnCount); err != nil {
		t.Fatal(err)
	}
	if columnCount != 1 {
		t.Fatalf("remaining_after_send column count = %d, want 1", columnCount)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('training_entries') WHERE name = 'idempotency_key'`).Scan(&columnCount); err != nil {
		t.Fatal(err)
	}
	if columnCount != 1 {
		t.Fatalf("training entry idempotency column count = %d, want 1", columnCount)
	}
	for _, column := range []string{"completion_outcome", "note"} {
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('training_entries') WHERE name = ?`, column).Scan(&columnCount); err != nil {
			t.Fatal(err)
		}
		if columnCount != 1 {
			t.Fatalf("training entry %s column count = %d, want 1", column, columnCount)
		}
	}
	// Rebuilding a parent table is where a foreign key quietly starts pointing
	// at the archive copy instead of the live one, and nothing else would notice
	// until a write failed in production.
	for _, child := range []string{"auth_credentials", "auth_sessions", "auth_audit_events", "coach_team_assignments"} {
		var references int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list(?) WHERE "table" = 'accounts'`, child).Scan(&references); err != nil {
			t.Fatal(err)
		}
		if references != 1 {
			t.Fatalf("%s references accounts %d times, want 1", child, references)
		}
	}
	// assignments is rebuilt by migration 000011 to point catalog_key at
	// assignment_catalog; reactions.context_assignment_id must still find it
	// afterward.
	var assignmentReferences int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list('reactions') WHERE "table" = 'assignments'`).Scan(&assignmentReferences); err != nil {
		t.Fatal(err)
	}
	if assignmentReferences != 1 {
		t.Fatalf("reactions references assignments %d times, want 1", assignmentReferences)
	}
	violations, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	defer violations.Close()
	if violations.Next() {
		t.Fatal("the migrated schema has foreign key violations")
	}

	var migrationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 26 {
		t.Fatalf("migration count = %d, want 26", migrationCount)
	}
}

func TestPlanPrizeBoxMigrationPreservesPopulatedUnlocks(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-plan-prizes.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
		INSERT INTO schema_migrations (version, applied_at) VALUES (23, '2026-08-24T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO clubs (id, name, created_at) VALUES ('club-prize-migration', 'Migration Club', '2026-08-24T00:00:00Z');
		INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-prize-migration', 'club-prize-migration', 'Pat', 'M', '{}', '2026-08-24T00:00:00Z');
		INSERT INTO player_unlocks (player_id, item_kind, item_id, source, unlocked_at) VALUES ('player-prize-migration', 'avatar_part', 'avatar-head-dog', 'daily_drop', '2026-08-24T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE version = 23`); err != nil {
		t.Fatal(err)
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("upgrade populated unlock ledger: %v", err)
	}
	var unlocks, grantTable int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM player_unlocks WHERE player_id = 'player-prize-migration' AND source = 'daily_drop'`).Scan(&unlocks); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'plan_prize_box_grants'`).Scan(&grantTable); err != nil {
		t.Fatal(err)
	}
	if unlocks != 1 || grantTable != 1 {
		t.Fatalf("migration result unlocks=%d grantTable=%d", unlocks, grantTable)
	}
}

func TestPlanCompletionMigrationPreservesPopulatedEntriesAndRestDays(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-provenance.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
		INSERT INTO schema_migrations (version, applied_at) VALUES (22, '2026-08-24T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO clubs (id, name, created_at) VALUES ('club-migration', 'Migration Club', '2026-08-24T00:00:00Z');
		INSERT INTO teams (id, club_id, name, season_id, time_zone, weekly_default_goal, created_at) VALUES ('team-migration', 'club-migration', 'Migration Team', 'season-migration', 'UTC', 3, '2026-08-24T00:00:00Z');
		INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-migration', 'club-migration', 'Pat', 'M', '{}', '2026-08-24T00:00:00Z');
		INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-migration', 'player-migration', '2026-08-24');
		INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until) VALUES ('entry-migration', 'player-migration', 'team-migration', 'hill-sprints', '2026-08-24T12:00:00Z', 8, 'reps', 4, 3, '2026-08-24T12:00:00Z', '2026-08-25T12:00:00Z');
		INSERT INTO team_canvas_rest_days (team_id, player_id, day_key, created_at) VALUES ('team-migration', 'player-migration', '2026-08-24', '2026-08-24T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE version = 22`); err != nil {
		t.Fatal(err)
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("upgrade populated database to plan provenance: %v", err)
	}
	var entryCount, restCount int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_entries WHERE id = 'entry-migration' AND training_plan_id IS NULL`).Scan(&entryCount); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_canvas_rest_days WHERE player_id = 'player-migration' AND training_plan_id IS NULL`).Scan(&restCount); err != nil {
		t.Fatal(err)
	}
	if entryCount != 1 || restCount != 1 {
		t.Fatalf("populated rows were not preserved: entries=%d rest=%d", entryCount, restCount)
	}
}
