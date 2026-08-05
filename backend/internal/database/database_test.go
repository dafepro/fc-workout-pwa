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
	var migrationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 2 {
		t.Fatalf("migration count = %d, want 2", migrationCount)
	}
}
