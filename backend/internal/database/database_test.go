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
	if migrationCount != 9 {
		t.Fatalf("migration count = %d, want 9", migrationCount)
	}
}
