package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestLogicalExportCommandsRoundTrip(t *testing.T) {
	directory := t.TempDir()
	archivePath := filepath.Join(directory, "export.tar.gz")
	targetPath := filepath.Join(directory, "imported.db")

	for _, arguments := range [][]string{
		{"export", "--database-url", seededDatabaseURL(t), "--output", archivePath, "--app-version", "cli-test"},
		{"verify-export", "--archive", archivePath},
		{"import", "--archive", archivePath, "--target", targetPath},
	} {
		if err := run(arguments); err != nil {
			t.Fatalf("%v: %v", arguments, err)
		}
	}

	db, err := database.Open(context.Background(), "file:"+filepath.ToSlash(targetPath))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var players int
	if err := db.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM players").Scan(&players); err != nil {
		t.Fatal(err)
	}
	if players == 0 {
		t.Fatal("import produced an empty database")
	}
	if err := run([]string{"import", "--archive", archivePath, "--target", targetPath}); err == nil {
		t.Fatal("import overwrote an existing target")
	}
}

func TestUnknownCommandIsRejected(t *testing.T) {
	if err := run([]string{"export-everything"}); err == nil {
		t.Fatal("run accepted an unknown command")
	}
	if err := run(nil); err == nil {
		t.Fatal("run accepted no command")
	}
}

func seededDatabaseURL(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "source.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.New(db, location).ResetE2EFixtures(ctx, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	return databaseURL
}

func TestReadIdentityRequiresPrivateRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.txt")
	if err := os.WriteFile(path, []byte("AGE-SECRET-KEY-TEST"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := readIdentity(path); err == nil {
		t.Fatal("readIdentity accepted a group/world-readable identity")
	}

	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	contents, err := readIdentity(path)
	if err != nil {
		t.Fatalf("readIdentity rejected a private identity: %v", err)
	}
	if contents != "AGE-SECRET-KEY-TEST" {
		t.Fatalf("readIdentity returned %q", contents)
	}

	if _, err := readIdentity(t.TempDir()); err == nil {
		t.Fatal("readIdentity accepted a directory")
	}
}
