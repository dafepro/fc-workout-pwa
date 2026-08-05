package backup_test

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/migrations"
)

func TestCreateVerifyAndRestoreArchive(t *testing.T) {
	ctx := context.Background()
	databaseURL := seededDatabase(t, ctx)
	archivePath := filepath.Join(t.TempDir(), "stridecrew-backup.tar.gz")
	createdAt := time.Date(2026, time.August, 5, 20, 30, 0, 0, time.UTC)

	manifest, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL:        databaseURL,
		ArchivePath:        archivePath,
		ApplicationVersion: "test-version",
		Now:                func() time.Time { return createdAt },
	})
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}
	if manifest.FormatVersion != 1 || manifest.CreatedAt != createdAt.Format(time.RFC3339) {
		t.Fatalf("unexpected manifest identity: %+v", manifest)
	}
	if manifest.ApplicationVersion != "test-version" || manifest.Encrypted {
		t.Fatalf("unexpected manifest metadata: %+v", manifest)
	}
	if manifest.Counts.TrainingEntries != 2 || manifest.Counts.Players != 12 {
		t.Fatalf("unexpected validation counts: %+v", manifest.Counts)
	}

	verified, err := backup.Verify(ctx, archivePath)
	if err != nil {
		t.Fatalf("verify backup: %v", err)
	}
	if verified.Database.SHA256 != manifest.Database.SHA256 || verified.Database.Bytes == 0 {
		t.Fatalf("verified database metadata does not match: %+v", verified.Database)
	}

	restoredPath := filepath.Join(t.TempDir(), "restored.db")
	restored, err := backup.Restore(ctx, backup.RestoreOptions{
		ArchivePath:  archivePath,
		DatabasePath: restoredPath,
	})
	if err != nil {
		t.Fatalf("restore backup: %v", err)
	}
	if restored.FormatVersion != manifest.FormatVersion {
		t.Fatalf("restored format = %d, want %d", restored.FormatVersion, manifest.FormatVersion)
	}

	db, err := database.Open(ctx, "file:"+filepath.ToSlash(restoredPath))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var entries, migrationsApplied int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM training_entries").Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&migrationsApplied); err != nil {
		t.Fatal(err)
	}
	if entries != 2 || migrationsApplied != 3 {
		t.Fatalf("restored entries=%d migrations=%d, want 2 and 3", entries, migrationsApplied)
	}
}

func TestRestoreRejectsCorruptionWithoutCreatingTarget(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "stridecrew-backup.tar.gz")
	if _, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL: seededDatabase(t, ctx),
		ArchivePath: archivePath,
	}); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	contents[len(contents)/2] ^= 0xff
	corruptPath := filepath.Join(t.TempDir(), "corrupt.tar.gz")
	if err := os.WriteFile(corruptPath, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	targetPath := filepath.Join(t.TempDir(), "must-not-exist.db")

	if _, err := backup.Restore(ctx, backup.RestoreOptions{
		ArchivePath:  corruptPath,
		DatabasePath: targetPath,
	}); err == nil {
		t.Fatal("restore accepted a corrupt archive")
	}
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Fatalf("restore target exists after rejection: %v", err)
	}
}

func TestRestoreAppliesForwardMigrationsToAnOlderSnapshot(t *testing.T) {
	ctx := context.Background()
	databaseURL := olderDatabase(t, ctx)
	archivePath := filepath.Join(t.TempDir(), "older.tar.gz")
	manifest, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL: databaseURL,
		ArchivePath: archivePath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := manifest.Database.SchemaMigrations; len(got) != 2 || got[1] != 2 {
		t.Fatalf("snapshot migrations = %v, want [1 2]", got)
	}

	restoredPath := filepath.Join(t.TempDir(), "forward-migrated.db")
	if _, err := backup.Restore(ctx, backup.RestoreOptions{
		ArchivePath:  archivePath,
		DatabasePath: restoredPath,
	}); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(restoredPath))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var columnCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('training_entries') WHERE name = 'idempotency_key'`).Scan(&columnCount); err != nil {
		t.Fatal(err)
	}
	if columnCount != 1 {
		t.Fatalf("idempotency column count = %d, want 1", columnCount)
	}
}

func TestRestoreRefusesToOverwriteAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "backup.tar.gz")
	if _, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL: seededDatabase(t, ctx),
		ArchivePath: archivePath,
	}); err != nil {
		t.Fatal(err)
	}
	targetPath := filepath.Join(t.TempDir(), "live.db")
	if err := os.WriteFile(targetPath, []byte("do not replace"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := backup.Restore(ctx, backup.RestoreOptions{
		ArchivePath:  archivePath,
		DatabasePath: targetPath,
	}); err == nil {
		t.Fatal("restore overwrote an existing database")
	}
	contents, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "do not replace" {
		t.Fatalf("existing target changed to %q", contents)
	}
}

func seededDatabase(t *testing.T, ctx context.Context) string {
	t.Helper()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "source.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := store.New(db, location).ResetE2EFixtures(ctx); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return databaseURL
}

func olderDatabase(t *testing.T, ctx context.Context) string {
	t.Helper()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "older.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, migration := range []struct {
		name    string
		version int
	}{
		{"000001_foundation.up.sql", 1},
		{"000002_reaction_replay_result.up.sql", 2},
	} {
		contents, err := fs.ReadFile(migrations.Files, migration.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-08-05T00:00:00Z')`, migration.version); err != nil {
			t.Fatal(err)
		}
	}
	return databaseURL
}
