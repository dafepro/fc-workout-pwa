package database

import (
	"context"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/migrations"
)

// The test that was missing. Migration 8 rebuilds accounts, which four tables
// point at, and it passed everywhere against an empty database: with no child
// rows there is nothing for a foreign key to violate. On the production
// database it failed at commit and the API crashlooped on startup.
//
// So this migrates a database that has rows in every table hanging off
// accounts, which is the only shape that exercises the failure.
func TestMigrateRebuildsAPopulatedParentTable(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// Build the schema as it stood before the staff work, then fill it.
	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{
		"000001_foundation.up.sql",
		"000002_reaction_replay_result.up.sql",
		"000003_training_entry_idempotency.up.sql",
		"000004_authentication.up.sql",
		"000005_assignments.up.sql",
		"000006_activity_defaults.up.sql",
		"000007_challenge_reactions.up.sql",
	} {
		contents, readErr := fs.ReadFile(migrations.Files, version)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", version, err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`,
			version[:6]); err != nil {
			t.Fatal(err)
		}
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Player', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		 VALUES ('account-1', 'club-1', 'player-1', 'player', 'active', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		 VALUES ('account-coach', 'club-1', NULL, 'coach', 'active', '2026-01-01T00:00:00Z')`,
		// Every child of accounts must have a row, or the rebuild is untested.
		`INSERT INTO coach_team_assignments (team_id, account_id, active_from) VALUES ('team-1', 'account-coach', '2026-01-01')`,
		`INSERT INTO auth_credentials (id, account_id, selector_hash, verifier_salt, verifier_hash, issued_at)
		 VALUES ('credential-1', 'account-1', X'01', X'02', X'03', '2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_sessions (id, account_id, credential_id, token_hash, created_at, expires_at, last_seen_at)
		 VALUES ('session-1', 'account-1', 'credential-1', X'04', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_audit_events (id, account_id, credential_id, session_id, event_type, occurred_at)
		 VALUES ('audit-1', 'account-1', 'credential-1', 'session-1', 'login_succeeded', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("migrate a populated database: %v", err)
	}

	// The rows survived the rebuild, and still point at the live table.
	for table, want := range map[string]int{
		"accounts": 2, "auth_credentials": 1, "auth_sessions": 1,
		"auth_audit_events": 1, "coach_team_assignments": 1,
	} {
		var count int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("%s has %d rows after the rebuild, want %d", table, count, want)
		}
	}
	for _, child := range []string{"auth_credentials", "auth_sessions", "auth_audit_events", "coach_team_assignments"} {
		var references int
		if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list(?) WHERE "table" = 'accounts'`, child).Scan(&references); err != nil {
			t.Fatal(err)
		}
		if references != 1 {
			t.Fatalf("%s references accounts %d times after the rebuild, want 1", child, references)
		}
	}
	violations, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		t.Fatal(err)
	}
	defer violations.Close()
	if violations.Next() {
		t.Fatal("the rebuilt schema has foreign key violations")
	}

	// The new shape is usable: an operator with no club, and nothing else
	// allowed to be clubless.
	if _, err = db.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES ('account-operator', NULL, NULL, 'platform_admin', 'active', '2026-08-08T00:00:00Z')`); err != nil {
		t.Fatalf("insert a platform_admin: %v", err)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES ('account-bad', NULL, NULL, 'coach', 'active', '2026-08-08T00:00:00Z')`); err == nil {
		t.Fatal("a coach with no club must be refused")
	}
}

// Migration 000011 rebuilds assignments the same way migration 8 rebuilt
// accounts, and reactions.context_assignment_id is the one row that survives
// it. Test it with a populated database, not an empty one, for the same
// reason TestMigrateRebuildsAPopulatedParentTable exists.
func TestMigrateRebuildsAPopulatedAssignmentsTable(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-assignments.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{
		"000001_foundation.up.sql",
		"000002_reaction_replay_result.up.sql",
		"000003_training_entry_idempotency.up.sql",
		"000004_authentication.up.sql",
		"000005_assignments.up.sql",
		"000006_activity_defaults.up.sql",
		"000007_challenge_reactions.up.sql",
		"000008_platform_admin_and_staff_audit.up.sql",
		"000009_staff_credentials.up.sql",
		"000010_admin_audit.up.sql",
	} {
		contents, readErr := fs.ReadFile(migrations.Files, version)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", version, err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`,
			version[:6]); err != nil {
			t.Fatal(err)
		}
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Sender', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-2', 'club-1', 'Recipient', 'B', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO assignments (id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
		 VALUES ('assignment-1', 'team-1', 'hill-sprints', 'hill_sprints_8x6', 6, 'reps', '2026-01-01', '2026-01-07', '2026-01-01T00:00:00Z')`,
		// The one row that must still find assignment-1 after the rebuild.
		`INSERT INTO reactions (id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, context_metric, context_assignment_id, team_day, idempotency_key, created_at)
		 VALUES ('reaction-1', 'player-1', 'player-2', 'team-1', 'clap',
			'challenge', NULL, NULL, 'assignment-1', '2026-01-02', 'idem-1', '2026-01-02T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("migrate a populated database: %v", err)
	}

	// The seeded row from 000011 plus the five presets 000013 adds. This is also
	// where the preset seed is proved against a populated database.
	for table, want := range map[string]int{"assignments": 1, "reactions": 1, "assignment_catalog": 6} {
		var count int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("%s has %d rows after the rebuild, want %d", table, count, want)
		}
	}
	var references int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list('reactions') WHERE "table" = 'assignments'`).Scan(&references); err != nil {
		t.Fatal(err)
	}
	if references != 1 {
		t.Fatalf("reactions references assignments %d times after the rebuild, want 1", references)
	}
	var catalogKey string
	if err = db.QueryRowContext(ctx, `SELECT catalog_key FROM assignments WHERE id = 'assignment-1'`).Scan(&catalogKey); err != nil {
		t.Fatal(err)
	}
	if catalogKey != "hill_sprints_8x6" {
		t.Fatalf("assignment-1 catalog_key = %q, want hill_sprints_8x6", catalogKey)
	}
	violations, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		t.Fatal(err)
	}
	defer violations.Close()
	if violations.Next() {
		t.Fatal("the rebuilt schema has foreign key violations")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO assignments (id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
		VALUES ('assignment-bad', 'team-1', 'hill-sprints', 'not_a_catalog_key', 6, 'reps', '2026-01-01', '2026-01-07', '2026-01-01T00:00:00Z')`); err == nil {
		t.Fatal("an assignment with an unknown catalog_key must be refused")
	}
}

func TestMigrateExpandsRotationForPopulatedCanvasPieces(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-canvas.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{
		"000001_foundation.up.sql",
		"000002_reaction_replay_result.up.sql",
		"000003_training_entry_idempotency.up.sql",
		"000004_authentication.up.sql",
		"000005_assignments.up.sql",
		"000006_activity_defaults.up.sql",
		"000007_challenge_reactions.up.sql",
		"000008_platform_admin_and_staff_audit.up.sql",
		"000009_staff_credentials.up.sql",
		"000010_admin_audit.up.sql",
		"000011_assignment_catalog.up.sql",
		"000012_admin_audit_actor_source.up.sql",
		"000013_team_canvas.up.sql",
	} {
		contents, readErr := fs.ReadFile(migrations.Files, version)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", version, err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`, version[:6]); err != nil {
			t.Fatal(err)
		}
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Player', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_canvas_pieces (
			id, team_id, week_key, day_key, owner_player_id, reward_slot, asset_id,
			x, y, size, rotation, revision, created_at, updated_at
		) VALUES (
			'piece-1', 'team-1', '2026-08-17', '2026-08-21', 'player-1', 1, 'soccer',
			50, 50, 44, 45, 3, '2026-08-21T12:00:00Z', '2026-08-21T13:00:00Z'
		)`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("migrate populated canvas: %v", err)
	}
	if _, err = db.ExecContext(ctx, `UPDATE team_canvas_pieces SET rotation = 135 WHERE id = 'piece-1'`); err != nil {
		t.Fatalf("store a full-circle rotation: %v", err)
	}
	var rotation float64
	if err = db.QueryRowContext(ctx, `SELECT rotation FROM team_canvas_pieces WHERE id = 'piece-1'`).Scan(&rotation); err != nil {
		t.Fatal(err)
	}
	if rotation != 135 {
		t.Fatalf("preserved rotation = %v, want 135", rotation)
	}
}

func TestMigrateAddsPhysicsStateWithoutLosingPopulatedCanvasPieces(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-canvas-physics.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "000015" || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		contents, readErr := fs.ReadFile(migrations.Files, entry.Name())
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", entry.Name(), err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`, entry.Name()[:6]); err != nil {
			t.Fatal(err)
		}
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Player', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_canvas_pieces (
			id, team_id, week_key, day_key, owner_player_id, reward_slot, asset_id,
			x, y, size, rotation, revision, created_at, updated_at
		) VALUES ('piece-1', 'team-1', '2026-08-17', '2026-08-21', 'player-1', 1,
			'soccer', 50, 50, 44, 0, 1, '2026-08-21T12:00:00Z', '2026-08-21T12:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"team_canvas_scene_states", "team_canvas_piece_states"} {
		var found int
		if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&found); err != nil || found != 1 {
			t.Fatalf("physics table %s missing: found=%d err=%v", table, found, err)
		}
	}
	var pieces int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_canvas_pieces WHERE id = 'piece-1'`).Scan(&pieces); err != nil || pieces != 1 {
		t.Fatalf("populated piece was lost: count=%d err=%v", pieces, err)
	}
}

func TestMigrateExpandsDeveloperSlotsWithoutLosingPhysicsChildren(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "populated-developer-stamps.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "000016" || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		contents, readErr := fs.ReadFile(migrations.Files, entry.Name())
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", entry.Name(), err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`, entry.Name()[:6]); err != nil {
			t.Fatal(err)
		}
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Player', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_canvas_settings (
			team_id, background_asset_id, background_color, text_color, text_size,
			text_style, stamp_choices_json, revision, updated_at
		) VALUES ('team-1', 'soccer-field', '#89C981', '#FFFFFF', 112,
			'block', '["soccer","balloon","rocket","bolt","star"]', 1, '2026-08-21T12:00:00Z')`,
		`INSERT INTO team_canvas_pieces (
			id, team_id, week_key, day_key, owner_player_id, reward_slot, asset_id,
			x, y, size, rotation, revision, created_at, updated_at
		) VALUES ('piece-1', 'team-1', '2026-08-17', '2026-08-21', 'player-1', 1,
			'soccer', 50, 50, 44, 0, 1, '2026-08-21T12:00:00Z', '2026-08-21T12:00:00Z')`,
		`INSERT INTO team_canvas_piece_states (
			piece_id, behavior_version, behavior_state_json, revision, updated_at
		) VALUES ('piece-1', 1, '{}', 1, '2026-08-21T12:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var pieces, physicsStates, developerLimit, developerCreated int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*), developer_created FROM team_canvas_pieces WHERE id = 'piece-1'`).Scan(&pieces, &developerCreated); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_canvas_piece_states WHERE piece_id = 'piece-1'`).Scan(&physicsStates); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT developer_stamp_limit FROM team_canvas_settings WHERE team_id = 'team-1'`).Scan(&developerLimit); err != nil {
		t.Fatal(err)
	}
	if pieces != 1 || physicsStates != 1 || developerCreated != 0 || developerLimit != 0 {
		t.Fatalf("migrated canvas pieces=%d physics=%d developer_created=%d limit=%d", pieces, physicsStates, developerCreated, developerLimit)
	}
	if _, err = db.ExecContext(ctx, `DELETE FROM team_canvas_pieces WHERE id = 'piece-1'`); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_canvas_piece_states WHERE piece_id = 'piece-1'`).Scan(&physicsStates); err != nil || physicsStates != 0 {
		t.Fatalf("physics child did not cascade after rebuild: count=%d err=%v", physicsStates, err)
	}
}

// Enforcement must be back on for the pool afterwards, or every later write
// silently skips its foreign keys.
func TestForeignKeysAreEnforcedAfterARebuildMigration(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "enforced.db"))
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	var enabled int
	if err = db.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if enabled != 1 {
		t.Fatal("foreign key enforcement did not come back on after the rebuild")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES ('account-orphan', 'club-does-not-exist', NULL, 'coach', 'active', '2026-08-08T00:00:00Z')`); err == nil {
		t.Fatal("a row pointing at a missing club must be refused")
	}
}
