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
	for table, columns := range map[string][]string{
		"daily_drop_claims":     {"opened_at", "open_idempotency_key_hash"},
		"plan_prize_box_grants": {"opened_at"},
	} {
		for _, column := range columns {
			if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, table, column).Scan(&columnCount); err != nil {
				t.Fatal(err)
			}
			if columnCount != 1 {
				t.Fatalf("%s.%s column count = %d, want 1", table, column, columnCount)
			}
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
	if migrationCount != 31 {
		t.Fatalf("migration count = %d, want 31", migrationCount)
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
		INSERT INTO schema_migrations (version, applied_at) VALUES
			(23, '2026-08-24T00:00:00Z'),
			(27, '2026-08-24T00:00:00Z')`); err != nil {
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
	if _, err = db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE version IN (23, 27)`); err != nil {
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

func TestTeamLoungeRoomGenerationMigrationPreservesAPopulatedBinding(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-lounge-room.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err = db.ExecContext(ctx, `
		CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
		WITH RECURSIVE versions(version) AS (
			SELECT 1
			UNION ALL
			SELECT version + 1 FROM versions WHERE version < 28
		)
		INSERT INTO schema_migrations (version, applied_at)
		SELECT version, '2026-08-25T00:00:00Z' FROM versions;

		CREATE TABLE teams (id TEXT PRIMARY KEY);
		CREATE TABLE team_lounge_v2_room_bindings (
			room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
			team_id TEXT NOT NULL REFERENCES teams(id),
			week_key TEXT NOT NULL CHECK (length(week_key) BETWEEN 1 AND 32),
			canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
			canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
			created_at TEXT NOT NULL,
			UNIQUE (team_id, week_key)
		);
		INSERT INTO teams (id) VALUES ('team-lounge-migration');
		INSERT INTO team_lounge_v2_room_bindings
			(room_id, team_id, week_key, canvas_id, canvas_version, created_at)
		VALUES
			('team:team-lounge-migration:lounge:2026-08-24:v1', 'team-lounge-migration', '2026-08-24', 'beach-boardwalk', 1, '2026-08-25T00:00:00Z');
	`); err != nil {
		t.Fatal(err)
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("upgrade a populated lounge room binding: %v", err)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO team_lounge_v2_room_bindings
		(room_id, team_id, week_key, canvas_id, canvas_version, created_at)
		VALUES
		('team:team-lounge-migration:lounge:2026-08-24:v2', 'team-lounge-migration', '2026-08-24', 'beach-boardwalk', 2, '2026-08-25T01:00:00Z')`); err != nil {
		t.Fatalf("insert the next immutable room generation: %v", err)
	}

	var generations int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_v2_room_bindings
		WHERE team_id = 'team-lounge-migration' AND week_key = '2026-08-24'`).Scan(&generations); err != nil {
		t.Fatal(err)
	}
	if generations != 2 {
		t.Fatalf("room generations = %d, want 2", generations)
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
