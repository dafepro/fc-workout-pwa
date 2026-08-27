package database

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/migrations"
)

func TestTrainingMomentumMigrationUpgradesPopulatedMainSchema(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "training-momentum.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err = db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for version := 1; version <= 13; version++ {
		name := migrationName(t, version)
		contents, readErr := fs.ReadFile(migrations.Files, name)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		if _, err = db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-27T00:00:00Z')`, version); err != nil {
			t.Fatal(err)
		}
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-1', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-1', 'club-1', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-1', 'club-1', 'Player', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO training_entries (
		 id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		 result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until, idempotency_key
		) VALUES (
		 'entry-1', 'player-1', 'team-1', 'hill-sprints', '2026-08-27T12:00:00Z', 6,
		 'reps', 4, 3, '2026-08-27T12:00:00Z', '2026-08-28T12:00:00Z', 'entry-key-1'
		)`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed populated schema: %v", err)
		}
	}

	if err = Migrate(ctx, db); err != nil {
		t.Fatalf("migrate populated main schema: %v", err)
	}

	var entries, migrationsApplied int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_entries WHERE id = 'entry-1'`).Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationsApplied); err != nil {
		t.Fatal(err)
	}
	if entries != 1 || migrationsApplied != 16 {
		t.Fatalf("entries=%d migrations=%d, want 1 and 16", entries, migrationsApplied)
	}

	for _, table := range []string{
		"training_plans",
		"training_plan_days",
		"training_plan_blocks",
		"planned_rest_check_ins",
	} {
		var found int
		if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = ?`, table).Scan(&found); err != nil {
			t.Fatal(err)
		}
		if found != 1 {
			t.Fatalf("table %s count = %d, want 1", table, found)
		}
	}

	for _, statement := range []string{
		`INSERT INTO training_plans (
		 id, team_id, template_id, template_version, template_name, template_summary,
		 starts_on, ends_on, status, created_at
		) VALUES (
		 'plan-1', 'team-1', 'safe-plan', 1, 'Safe plan', 'A bounded plan.',
		 '2026-08-27', '2026-09-02', 'published', '2026-08-27T00:00:00Z'
		)`,
		`INSERT INTO training_plan_days (
		 plan_id, day_index, occurs_on, kind, focus, duration_minutes, intensity
		) VALUES ('plan-1', 0, '2026-08-27', 'training', 'speed', 20, 'hard')`,
		`INSERT INTO training_plan_blocks (
		 plan_id, day_index, block_index, activity_definition_id, label, duration_minutes
		) VALUES ('plan-1', 0, 0, 'hill-sprints', 'Hill sprints', 12)`,
		`INSERT INTO training_plan_days (
		 plan_id, day_index, occurs_on, kind, focus, duration_minutes, intensity
		) VALUES ('plan-1', 1, '2026-08-28', 'rest', 'recovery', 0, 'easy')`,
		`INSERT INTO planned_rest_check_ins (
		 id, player_id, team_id, training_plan_id, training_plan_day_index,
		 occurs_on, idempotency_key, created_at
		) VALUES (
		 'rest-1', 'player-1', 'team-1', 'plan-1', 1,
		 '2026-08-28', 'rest-key-1', '2026-08-28T12:00:00Z'
		)`,
		`UPDATE training_entries SET
		 training_plan_id = 'plan-1', training_plan_day_index = 0,
		 training_plan_block_index = 0, completion_outcome = 'partial'
		 WHERE id = 'entry-1'`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("use final training schema: %v", err)
		}
	}
	if _, err = db.ExecContext(ctx, `UPDATE training_entries SET completion_outcome = 'maximized' WHERE id = 'entry-1'`); err == nil {
		t.Fatal("an unapproved completion outcome must be refused")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO planned_rest_check_ins (
		id, player_id, team_id, training_plan_id, training_plan_day_index, occurs_on, idempotency_key, created_at
	) VALUES (
		'rest-orphan', 'player-1', 'team-1', 'missing-plan', 0, '2026-08-29', 'rest-key-2', '2026-08-29T12:00:00Z'
	)`); err == nil {
		t.Fatal("a planned-rest check-in without a plan day must be refused")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO planned_rest_check_ins (
		id, player_id, team_id, training_plan_id, training_plan_day_index, occurs_on, idempotency_key, created_at
	) VALUES (
		'rest-duplicate', 'player-1', 'team-1', 'plan-1', 1, '2026-08-28', 'rest-key-3', '2026-08-28T13:00:00Z'
	)`); err == nil {
		t.Fatal("a player must not record planned rest twice on the same team day")
	}

	var noteColumns int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('training_entries') WHERE name = 'note'`).Scan(&noteColumns); err != nil {
		t.Fatal(err)
	}
	if noteColumns != 0 {
		t.Fatal("training entries must not gain a free-text note column")
	}

	down, err := fs.ReadFile(migrations.Files, "000014_training_momentum.down.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, string(down)); err != nil {
		t.Fatalf("roll back final training schema: %v", err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_entries WHERE id = 'entry-1'`).Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if entries != 1 {
		t.Fatalf("entries after rollback = %d, want 1", entries)
	}
}

func migrationName(t *testing.T, version int) string {
	t.Helper()
	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		t.Fatal(err)
	}
	prefix := fmt.Sprintf("%06d", version)
	for _, entry := range entries {
		name := entry.Name()
		if len(name) >= 9 && name[:6] == prefix && name[len(name)-7:] == ".up.sql" {
			return name
		}
	}
	t.Fatalf("migration %06d not found", version)
	return ""
}
