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

func TestMigrateRetiresOnlyLeaderboardReactionsFromAPopulatedDatabase(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "retire-leaderboards.db"))
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
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".up.sql") || name[:6] > "000021" {
			continue
		}
		if err = applyMigration(ctx, db, name); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-r', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-r', 'club-r', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('sender-r', 'club-r', 'Sender', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('recipient-r', 'club-r', 'Recipient', 'B', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO assignments (id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
		 VALUES ('assignment-r', 'team-r', 'hill-sprints', 'hill_sprints_8x6', 6, 'reps', '2026-01-01', '2026-01-07', '2026-01-01T00:00:00Z')`,
		`INSERT INTO reactions (id, sender_player_id, recipient_player_id, team_id, reaction_type,
		 context_type, context_period, context_metric, context_assignment_id, team_day, idempotency_key, created_at)
		 VALUES ('reaction-progress', 'sender-r', 'recipient-r', 'team-r', 'clap',
		 'team_progress', 'weekly', NULL, NULL, '2026-01-02', 'idem-progress', '2026-01-02T00:00:00Z')`,
		`INSERT INTO reactions (id, sender_player_id, recipient_player_id, team_id, reaction_type,
		 context_type, context_period, context_metric, context_assignment_id, team_day, idempotency_key, created_at)
		 VALUES ('reaction-leaderboard', 'sender-r', 'recipient-r', 'team-r', 'fire',
		 'leaderboard', 'season', 'effort', NULL, '2026-01-02', 'idem-leaderboard', '2026-01-02T00:01:00Z')`,
		`INSERT INTO reactions (id, sender_player_id, recipient_player_id, team_id, reaction_type,
		 context_type, context_period, context_metric, context_assignment_id, team_day, idempotency_key, created_at)
		 VALUES ('reaction-challenge', 'sender-r', 'recipient-r', 'team-r', 'strong',
		 'challenge', NULL, NULL, 'assignment-r', '2026-01-02', 'idem-challenge', '2026-01-02T00:02:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("retire leaderboard reactions: %v", err)
	}
	var contexts string
	if err = db.QueryRowContext(ctx, `SELECT group_concat(context_type, ',') FROM reactions ORDER BY created_at`).Scan(&contexts); err != nil {
		t.Fatal(err)
	}
	if contexts != "team_progress,challenge" {
		t.Fatalf("surviving contexts = %q, want team_progress,challenge", contexts)
	}
	var metricColumns int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('reactions') WHERE name = 'context_metric'`).Scan(&metricColumns); err != nil {
		t.Fatal(err)
	}
	if metricColumns != 0 {
		t.Fatalf("context_metric column count = %d, want 0", metricColumns)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO reactions (id, sender_player_id, recipient_player_id, team_id,
		reaction_type, context_type, context_period, context_assignment_id, team_day, idempotency_key, created_at)
		VALUES ('reaction-invalid', 'sender-r', 'recipient-r', 'team-r', 'fire', 'leaderboard', 'weekly', NULL,
		'2026-01-02', 'idem-invalid', '2026-01-02T00:03:00Z')`); err == nil {
		t.Fatal("the retired leaderboard context must be rejected by the database")
	}
}

func TestMigrateAddsChatPackPrizeKindToPopulatedInventory(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "chat-pack-prizes.db"))
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
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".up.sql") || name[:6] > "000022" {
			continue
		}
		if err = applyMigration(ctx, db, name); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-p', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-p', 'club-p', 'Player', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO player_unlocks (player_id, item_kind, item_id, source, unlocked_at)
		 VALUES ('player-p', 'lounge_stamp', 'lounge-stamp-shield', 'daily_check_in', '2026-01-02T00:00:00Z')`,
		`INSERT INTO prize_boxes (id, player_id, source, daily_day, daily_time_zone, catalog_version,
		 earned_at, earned_idempotency_key_hash, opened_at, open_idempotency_key_hash, item_kind, item_id)
		 VALUES ('box-p', 'player-p', 'daily_check_in', '2026-01-02', 'UTC', 1,
		 '2026-01-02T00:00:00Z', randomblob(32), '2026-01-02T00:01:00Z', randomblob(32),
		 'lounge_stamp', 'lounge-stamp-shield')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("add chat pack prize kind: %v", err)
	}
	var existing int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM player_unlocks
		WHERE player_id = 'player-p' AND item_kind = 'lounge_stamp'`).Scan(&existing); err != nil || existing != 1 {
		t.Fatalf("existing unlock count = %d, %v", existing, err)
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO player_unlocks
		(player_id, item_kind, item_id, source, unlocked_at)
		VALUES ('player-p', 'lounge_chat_pack', 'lounge-chat-pack-pirate-1', 'daily_check_in', '2026-01-03T00:00:00Z')`); err != nil {
		t.Fatalf("insert chat pack unlock: %v", err)
	}
	var violations int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_check`).Scan(&violations); err != nil || violations != 0 {
		t.Fatalf("foreign key violations = %d, %v", violations, err)
	}
}
