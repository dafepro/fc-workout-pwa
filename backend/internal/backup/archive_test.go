package backup_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
	"time"

	"filippo.io/age"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/migrations"
)

const currentSchemaMigrationCount = 30

func TestEncryptedArchiveRequiresTheOperatorIdentityToVerifyAndRestore(t *testing.T) {
	ctx := context.Background()
	plainPath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz")
	manifest, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL:        seededDatabase(t, ctx),
		ArchivePath:        plainPath,
		ApplicationVersion: "encrypted-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	encryptedPath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz.age")
	if err := backup.EncryptArchive(plainPath, encryptedPath, identity.Recipient().String()); err != nil {
		t.Fatalf("encrypt archive: %v", err)
	}

	encryptedBytes, err := os.ReadFile(encryptedPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(encryptedBytes) < len("age-encryption.org/v1") || string(encryptedBytes[:len("age-encryption.org/v1")]) != "age-encryption.org/v1" {
		t.Fatal("encrypted backup did not use the age v1 envelope")
	}
	wrongIdentity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := backup.VerifyEncrypted(ctx, encryptedPath, wrongIdentity.String()); err == nil {
		t.Fatal("encrypted backup verified with the wrong identity")
	}

	verified, err := backup.VerifyEncrypted(ctx, encryptedPath, identity.String())
	if err != nil {
		t.Fatalf("verify encrypted backup: %v", err)
	}
	if verified.Database.SHA256 != manifest.Database.SHA256 {
		t.Fatal("encrypted verification returned the wrong manifest")
	}
	restoredPath := filepath.Join(t.TempDir(), "restored.db")
	restored, err := backup.RestoreEncrypted(ctx, backup.RestoreOptions{
		ArchivePath:  encryptedPath,
		DatabasePath: restoredPath,
	}, identity.String())
	if err != nil {
		t.Fatalf("restore encrypted backup: %v", err)
	}
	if restored.Database.SHA256 != manifest.Database.SHA256 {
		t.Fatal("encrypted restore returned the wrong manifest")
	}
}

// A recovery operator supplies whatever age-keygen wrote, and that file carries
// two comment lines above the key. Rejecting it fails a real restore for a
// cosmetic reason, which is the worst possible moment to be strict.
func TestEncryptedArchiveAcceptsTheIdentityFileAgeKeygenWrites(t *testing.T) {
	ctx := context.Background()
	plainPath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz")
	if _, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL:        seededDatabase(t, ctx),
		ArchivePath:        plainPath,
		ApplicationVersion: "identity-format-test",
	}); err != nil {
		t.Fatal(err)
	}
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	encryptedPath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz.age")
	if err := backup.EncryptArchive(plainPath, encryptedPath, identity.Recipient().String()); err != nil {
		t.Fatal(err)
	}

	keygenFile := "# created: 2026-08-08T00:00:00Z\n" +
		"# public key: " + identity.Recipient().String() + "\n" +
		identity.String() + "\n"
	if _, err := backup.VerifyEncrypted(ctx, encryptedPath, keygenFile); err != nil {
		t.Fatalf("verify with an age-keygen identity file: %v", err)
	}
	restoredPath := filepath.Join(t.TempDir(), "restored.db")
	if _, err := backup.RestoreEncrypted(ctx, backup.RestoreOptions{
		ArchivePath:  encryptedPath,
		DatabasePath: restoredPath,
	}, keygenFile); err != nil {
		t.Fatalf("restore with an age-keygen identity file: %v", err)
	}

	second, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	// One archive has one recovery key. Two means the operator grabbed the wrong
	// file, and guessing which key was meant is not this command's job.
	refusals := map[string]string{
		"two identities": identity.String() + "\n" + second.String() + "\n",
		"only comments":  "# public key: " + identity.Recipient().String() + "\n",
		"empty":          "\n\n",
	}
	for name, identityText := range refusals {
		if _, err := backup.VerifyEncrypted(ctx, encryptedPath, identityText); err == nil {
			t.Fatalf("verified an identity file with %s", name)
		}
	}
}

func TestCreateVerifyAndRestoreArchive(t *testing.T) {
	ctx := context.Background()
	databaseURL := seededDatabase(t, ctx)
	archivePath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz")
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
	if entries != 2 || migrationsApplied != currentSchemaMigrationCount {
		t.Fatalf("restored entries=%d migrations=%d, want 2 and %d", entries, migrationsApplied, currentSchemaMigrationCount)
	}
}

func TestArchiveRoundTripIncludesCanonicalRewardMedia(t *testing.T) {
	ctx := context.Background()
	databaseURL := seededDatabase(t, ctx)
	db := openDatabase(t, ctx, databaseURL)
	if _, err := db.ExecContext(ctx, `INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-media-coach', 'club-zoomigo', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	mediaRoot := filepath.Join(t.TempDir(), "reward-media")
	mediaDirectory := filepath.Join(mediaRoot, "media_backup_one")
	if err := os.MkdirAll(mediaDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	display := []byte("canonical display bytes")
	thumbnail := []byte("canonical thumbnail bytes")
	if err := os.WriteFile(filepath.Join(mediaDirectory, "display.jpg"), display, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mediaDirectory, "thumbnail.jpg"), thumbnail, 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(display)
	if _, err := db.ExecContext(ctx, `INSERT INTO team_reward_media (
		id, team_id, storage_key, sha256, mime_type, width, height, byte_size,
		alt_kind, created_by_account_id, created_at
	) VALUES ('media-backup-one', 'team-hill-striders', 'media_backup_one', ?,
		'image/jpeg', 1200, 800, ?, 'prize_image', 'account-media-coach', '2026-08-23T00:00:00Z')`,
		hex.EncodeToString(digest[:]), len(display)); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	archivePath := filepath.Join(t.TempDir(), "media-backup.tar.gz")
	manifest, err := backup.Create(ctx, backup.CreateOptions{
		DatabaseURL: databaseURL, ArchivePath: archivePath,
		RewardMediaDirectory: mediaRoot, Now: func() time.Time {
			return time.Date(2026, time.August, 23, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if manifest.RewardMedia == nil || manifest.RewardMedia.Count != 1 {
		t.Fatalf("media manifest = %+v", manifest.RewardMedia)
	}
	restoredDatabase := filepath.Join(t.TempDir(), "restored.db")
	restoredMedia := filepath.Join(t.TempDir(), "restored-media")
	if _, err = backup.Restore(ctx, backup.RestoreOptions{
		ArchivePath: archivePath, DatabasePath: restoredDatabase, RewardMediaDirectory: restoredMedia,
	}); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(restoredMedia, "media_backup_one", "thumbnail.jpg"))
	if err != nil || !bytes.Equal(contents, thumbnail) {
		t.Fatalf("restored thumbnail = %q err=%v", contents, err)
	}
}

func TestRestoreRejectsCorruptionWithoutCreatingTarget(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "zoomigo-backup.tar.gz")
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
	if err := store.New(db, location).ResetE2EFixtures(ctx, time.Now().UTC()); err != nil {
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
