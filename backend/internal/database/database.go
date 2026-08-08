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
	if strings.HasPrefix(string(contents), rebuildDirective) {
		return applyTableRebuild(ctx, db, version, string(contents))
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

// A migration that rebuilds a table other tables point at must say so on its
// first line. SQLite cannot alter a CHECK or a NOT NULL, so the only way to
// change one is to build the table again -- and dropping a parent table while
// foreign keys are enforced is counted as deleting every row a child still
// references. Deferring that check does not help: the violation counter is
// incremented by the drop and never decremented by renaming a replacement into
// place, so the commit fails on any database that actually has rows in it.
//
// The documented answer is to disable foreign keys around the rebuild, which is
// a no-op inside a transaction, hence the separate path below.
const rebuildDirective = "-- zoomigo:table-rebuild"

// applyTableRebuild runs SQLite's documented table-rebuild sequence: foreign
// keys off outside the transaction, the rebuild inside it, an explicit
// integrity check before committing, and foreign keys back on afterwards. It
// stays atomic, so a failure leaves the schema exactly as it was.
func applyTableRebuild(ctx context.Context, db *sql.DB, version int, contents string) error {
	// One dedicated connection, because a PRAGMA is connection state and the
	// pool must not hand this one out mid-rebuild with enforcement disabled.
	connection, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection for migration %d: %w", version, err)
	}
	defer connection.Close()

	if _, err = connection.ExecContext(ctx, "PRAGMA foreign_keys = OFF"); err != nil {
		return fmt.Errorf("disable foreign keys for migration %d: %w", version, err)
	}
	restored := false
	restore := func() {
		if restored {
			return
		}
		restored = true
		// Background context: enforcement must come back even when the caller's
		// context is already cancelled, or this connection returns to the pool
		// with foreign keys silently off.
		_, _ = connection.ExecContext(context.Background(), "PRAGMA foreign_keys = ON")
	}
	defer restore()

	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("begin migration %d: %w", version, err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	if _, err = connection.ExecContext(ctx, contents); err != nil {
		return fmt.Errorf("apply migration %d: %w", version, err)
	}
	// With enforcement off, nothing has checked referential integrity, so this
	// is the check. It runs before the commit so a rebuild that orphaned a row
	// aborts instead of shipping.
	if err = assertNoForeignKeyViolations(ctx, connection, version); err != nil {
		return err
	}
	if _, err = connection.ExecContext(ctx, "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
		version, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("record migration %d: %w", version, err)
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("commit migration %d: %w", version, err)
	}
	committed = true
	restore()
	return nil
}

func assertNoForeignKeyViolations(ctx context.Context, connection *sql.Conn, version int) error {
	rows, err := connection.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return fmt.Errorf("check migration %d integrity: %w", version, err)
	}
	defer rows.Close()
	var offenders []string
	for rows.Next() {
		var table, parent sql.NullString
		var rowID, constraintIndex sql.NullInt64
		if err = rows.Scan(&table, &rowID, &parent, &constraintIndex); err != nil {
			return fmt.Errorf("check migration %d integrity: %w", version, err)
		}
		offenders = append(offenders, fmt.Sprintf("%s -> %s", table.String, parent.String))
	}
	if err = rows.Err(); err != nil {
		return fmt.Errorf("check migration %d integrity: %w", version, err)
	}
	if len(offenders) > 0 {
		return fmt.Errorf("migration %d left %d foreign key violations (%s)", version, len(offenders), strings.Join(offenders, ", "))
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
