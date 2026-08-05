package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/migrations"
	_ "modernc.org/sqlite"
)

func Open(ctx context.Context, databaseURL string) (*sql.DB, error) {
	if err := ensureDatabaseDirectory(databaseURL); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("configure sqlite: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}

func Migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		if err := applyMigration(ctx, db, name); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(ctx context.Context, db *sql.DB, name string) error {
	if len(name) < 6 {
		return fmt.Errorf("migration %q has no numeric version", name)
	}
	version, err := strconv.Atoi(name[:6])
	if err != nil {
		return fmt.Errorf("migration %q has no numeric version: %w", name, err)
	}
	var applied int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE version = ?", version).Scan(&applied); err != nil {
		return fmt.Errorf("read migration %d ledger: %w", version, err)
	}
	if applied == 1 {
		return nil
	}

	contents, err := fs.ReadFile(migrations.Files, name)
	if err != nil {
		return fmt.Errorf("read migration %d: %w", version, err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", version, err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, string(contents)); err != nil {
		return fmt.Errorf("apply migration %d: %w", version, err)
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", version, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("record migration %d: %w", version, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %d: %w", version, err)
	}
	return nil
}

func ensureDatabaseDirectory(databaseURL string) error {
	if !strings.HasPrefix(databaseURL, "file:") || strings.Contains(databaseURL, "mode=memory") {
		return nil
	}
	path := strings.TrimPrefix(databaseURL, "file:")
	path = strings.SplitN(path, "?", 2)[0]
	if path == "" || path == ":memory:" {
		return nil
	}
	directory := filepath.Dir(filepath.FromSlash(path))
	if directory == "." {
		return nil
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create sqlite directory: %w", err)
	}
	return nil
}
