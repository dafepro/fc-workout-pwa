package backup_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"filippo.io/age"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

// A new table must be added here too, or the round-trip test fails.
var exportedTables = []string{
	"clubs",
	"teams",
	"players",
	"accounts",
	"team_memberships",
	"coach_team_assignments",
	"activity_definitions",
	"assignments",
	"training_entries",
	"reactions",
	"auth_credentials",
	"auth_sessions",
	"auth_audit_events",
}

func TestLogicalExportAndImportPreserveEveryTableExactly(t *testing.T) {
	ctx := context.Background()
	databaseURL := fullyPopulatedDatabase(t, ctx)
	archivePath := filepath.Join(t.TempDir(), "zoomigo-logical.tar.gz")
	createdAt := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)

	manifest, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL:        databaseURL,
		ArchivePath:        archivePath,
		ApplicationVersion: "logical-test",
		Now:                func() time.Time { return createdAt },
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if manifest.FormatVersion != backup.LogicalFormatVersion || manifest.Kind != backup.LogicalKind {
		t.Fatalf("unexpected manifest identity: %+v", manifest)
	}
	if manifest.CreatedAt != createdAt.Format(time.RFC3339) || manifest.ApplicationVersion != "logical-test" {
		t.Fatalf("unexpected manifest metadata: %+v", manifest)
	}
	if len(manifest.Source.SchemaMigrations) != 5 {
		t.Fatalf("source migrations = %v, want five applied", manifest.Source.SchemaMigrations)
	}
	exported := make([]string, 0, len(manifest.Tables))
	for _, table := range manifest.Tables {
		exported = append(exported, table.Name)
		if table.SHA256 == "" || table.Path != "tables/"+table.Name+".jsonl" {
			t.Fatalf("table %q has incomplete manifest metadata: %+v", table.Name, table)
		}
	}
	if strings.Join(exported, ",") != strings.Join(exportedTables, ",") {
		t.Fatalf("exported tables = %v, want %v", exported, exportedTables)
	}

	if _, err := backup.VerifyLogical(ctx, archivePath); err != nil {
		t.Fatalf("verify export: %v", err)
	}

	targetPath := filepath.Join(t.TempDir(), "imported.db")
	imported, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{
		ArchivePath:  archivePath,
		DatabasePath: targetPath,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if imported.CreatedAt != manifest.CreatedAt {
		t.Fatalf("imported manifest = %+v, want the exported one", imported)
	}

	source := openDatabase(t, ctx, databaseURL)
	target := openDatabase(t, ctx, "file:"+filepath.ToSlash(targetPath))
	for _, table := range exportedTables {
		want := readTableRows(t, ctx, source, table)
		got := readTableRows(t, ctx, target, table)
		if len(want) == 0 {
			t.Fatalf("fixture left %s empty, so the round trip proves nothing", table)
		}
		if strings.Join(want, "\n") != strings.Join(got, "\n") {
			t.Fatalf("table %s did not round trip:\nsource:\n%s\nimported:\n%s",
				table, strings.Join(want, "\n"), strings.Join(got, "\n"))
		}
	}
	var ledger int
	if err := target.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if ledger != 5 {
		t.Fatalf("imported migration ledger = %d, want the current 5", ledger)
	}
}

func TestLogicalExportFromAnOlderSchemaImportsIntoTheCurrentSchema(t *testing.T) {
	ctx := context.Background()
	databaseURL := olderDatabase(t, ctx)
	seedOlderSchemaRows(t, ctx, databaseURL)
	archivePath := filepath.Join(t.TempDir(), "older-logical.tar.gz")

	manifest, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL: databaseURL,
		ArchivePath: archivePath,
	})
	if err != nil {
		t.Fatalf("export older schema: %v", err)
	}
	if got := manifest.Source.SchemaMigrations; len(got) != 2 {
		t.Fatalf("source migrations = %v, want the two-migration schema", got)
	}
	for _, table := range manifest.Tables {
		switch table.Name {
		case "assignments", "auth_credentials", "auth_sessions", "auth_audit_events":
			t.Fatalf("older export contains %q, which that schema does not have", table.Name)
		case "training_entries":
			if contains(table.Fields, "idempotency_key") {
				t.Fatal("older export contains a field migration 3 had not added yet")
			}
		}
	}

	targetPath := filepath.Join(t.TempDir(), "forward-imported.db")
	if _, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{
		ArchivePath:  archivePath,
		DatabasePath: targetPath,
	}); err != nil {
		t.Fatalf("import older export into the current schema: %v", err)
	}

	target := openDatabase(t, ctx, "file:"+filepath.ToSlash(targetPath))
	var entries, migrationsApplied int
	var idempotencyKey sql.NullString
	if err := target.QueryRowContext(ctx, "SELECT COUNT(*) FROM training_entries").Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if err := target.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&migrationsApplied); err != nil {
		t.Fatal(err)
	}
	if err := target.QueryRowContext(ctx, "SELECT idempotency_key FROM training_entries WHERE id = 'entry-old'").Scan(&idempotencyKey); err != nil {
		t.Fatal(err)
	}
	if entries != 1 || migrationsApplied != 5 {
		t.Fatalf("entries=%d migrations=%d, want 1 and 5", entries, migrationsApplied)
	}
	if idempotencyKey.Valid {
		t.Fatalf("field added after the export defaulted to %q, want NULL", idempotencyKey.String)
	}
	// Tables the old schema never had must import as empty, not as errors.
	for _, table := range []string{"assignments", "auth_credentials", "auth_sessions", "auth_audit_events"} {
		var count int
		if err := target.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s imported %d rows from a schema without it", table, count)
		}
	}
}

func TestLogicalExportIsByteIdenticalForTheSameData(t *testing.T) {
	ctx := context.Background()
	databaseURL := fullyPopulatedDatabase(t, ctx)
	createdAt := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	directory := t.TempDir()

	digests := make([]string, 2)
	for index := range digests {
		archivePath := filepath.Join(directory, fmt.Sprintf("export-%d.tar.gz", index))
		if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
			DatabaseURL:        databaseURL,
			ArchivePath:        archivePath,
			ApplicationVersion: "deterministic",
			Now:                func() time.Time { return createdAt },
		}); err != nil {
			t.Fatal(err)
		}
		contents, err := os.ReadFile(archivePath)
		if err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(contents)
		digests[index] = hex.EncodeToString(digest[:])
	}
	if digests[0] != digests[1] {
		t.Fatal("two exports of identical data produced different archives")
	}
}

func TestLogicalImportRejectsCorruptionWithoutCreatingTarget(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "logical.tar.gz")
	if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL: fullyPopulatedDatabase(t, ctx),
		ArchivePath: archivePath,
	}); err != nil {
		t.Fatal(err)
	}
	corruptPath := filepath.Join(t.TempDir(), "corrupt.tar.gz")
	rewriteLogicalArchive(t, archivePath, corruptPath, func(files map[string][]byte) {
		files["tables/players.jsonl"] = bytes.Replace(files["tables/players.jsonl"], []byte("Mason"), []byte("Maxon"), 1)
	})
	targetPath := filepath.Join(t.TempDir(), "must-not-exist.db")

	if _, err := backup.VerifyLogical(ctx, corruptPath); err == nil {
		t.Fatal("verify accepted a table whose contents no longer match its digest")
	}
	if _, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{
		ArchivePath:  corruptPath,
		DatabasePath: targetPath,
	}); err == nil {
		t.Fatal("import accepted a corrupt export")
	}
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Fatalf("import target exists after rejection: %v", err)
	}
}

func TestLogicalImportRejectsAnExportFromANewerBuild(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "logical.tar.gz")
	if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL: fullyPopulatedDatabase(t, ctx),
		ArchivePath: archivePath,
	}); err != nil {
		t.Fatal(err)
	}
	newerPath := filepath.Join(t.TempDir(), "newer.tar.gz")
	rewriteLogicalArchive(t, archivePath, newerPath, func(files map[string][]byte) {
		addUnknownField(t, files, "players", "nickname", `"Speedy"`)
	})

	if _, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{
		ArchivePath:  newerPath,
		DatabasePath: filepath.Join(t.TempDir(), "must-not-exist.db"),
	}); err == nil {
		t.Fatal("import accepted a field this build cannot store")
	} else if !strings.Contains(err.Error(), "nickname") {
		t.Fatalf("import error does not name the unknown field: %v", err)
	}
}

func TestLogicalImportRefusesToOverwriteAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	archivePath := filepath.Join(t.TempDir(), "logical.tar.gz")
	if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL: fullyPopulatedDatabase(t, ctx),
		ArchivePath: archivePath,
	}); err != nil {
		t.Fatal(err)
	}
	targetPath := filepath.Join(t.TempDir(), "live.db")
	if err := os.WriteFile(targetPath, []byte("do not replace"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{
		ArchivePath:  archivePath,
		DatabasePath: targetPath,
	}); err == nil {
		t.Fatal("import overwrote an existing database")
	}
	contents, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "do not replace" {
		t.Fatalf("existing target changed to %q", contents)
	}
}

func TestEncryptedLogicalExportRequiresTheOperatorIdentity(t *testing.T) {
	ctx := context.Background()
	plainPath := filepath.Join(t.TempDir(), "logical.tar.gz")
	manifest, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{
		DatabaseURL: fullyPopulatedDatabase(t, ctx),
		ArchivePath: plainPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	encryptedPath := filepath.Join(t.TempDir(), "logical.tar.gz.age")
	if err := backup.EncryptArchive(plainPath, encryptedPath, identity.Recipient().String()); err != nil {
		t.Fatal(err)
	}
	wrongIdentity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := backup.VerifyLogicalEncrypted(ctx, encryptedPath, wrongIdentity.String()); err == nil {
		t.Fatal("encrypted export verified with the wrong identity")
	}
	verified, err := backup.VerifyLogicalEncrypted(ctx, encryptedPath, identity.String())
	if err != nil {
		t.Fatalf("verify encrypted export: %v", err)
	}
	if verified.CreatedAt != manifest.CreatedAt {
		t.Fatal("encrypted verification returned the wrong manifest")
	}
	targetPath := filepath.Join(t.TempDir(), "imported.db")
	if _, err := backup.ImportLogicalEncrypted(ctx, backup.LogicalImportOptions{
		ArchivePath:  encryptedPath,
		DatabasePath: targetPath,
	}, identity.String()); err != nil {
		t.Fatalf("import encrypted export: %v", err)
	}
	target := openDatabase(t, ctx, "file:"+filepath.ToSlash(targetPath))
	var players int
	if err := target.QueryRowContext(ctx, "SELECT COUNT(*) FROM players").Scan(&players); err != nil {
		t.Fatal(err)
	}
	if players == 0 {
		t.Fatal("encrypted import produced an empty database")
	}
}

func TestSQLiteArchiveAndLogicalExportRejectEachOther(t *testing.T) {
	ctx := context.Background()
	databaseURL := fullyPopulatedDatabase(t, ctx)
	snapshotPath := filepath.Join(t.TempDir(), "snapshot.tar.gz")
	logicalPath := filepath.Join(t.TempDir(), "logical.tar.gz")
	if _, err := backup.Create(ctx, backup.CreateOptions{DatabaseURL: databaseURL, ArchivePath: snapshotPath}); err != nil {
		t.Fatal(err)
	}
	if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{DatabaseURL: databaseURL, ArchivePath: logicalPath}); err != nil {
		t.Fatal(err)
	}
	if _, err := backup.Verify(ctx, logicalPath); err == nil {
		t.Fatal("the SQLite snapshot verifier accepted a logical export")
	}
	if _, err := backup.VerifyLogical(ctx, snapshotPath); err == nil {
		t.Fatal("the logical verifier accepted a SQLite snapshot archive")
	}
}

// Seeds every exported table, including nullable, BLOB, and later-migration columns.
func fullyPopulatedDatabase(t *testing.T, ctx context.Context) string {
	t.Helper()
	databaseURL := seededDatabase(t, ctx)
	db := openDatabase(t, ctx, databaseURL)
	statements := []string{
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		 VALUES ('account-coach', 'club-zoomigo', NULL, 'coach', 'active', '2026-01-02T00:00:00Z')`,
		`INSERT INTO coach_team_assignments (team_id, account_id, active_from, active_to)
		 VALUES ('team-hill-striders', 'account-coach', '2026-01-02', NULL)`,
		`UPDATE team_memberships SET active_to = '2026-06-30' WHERE player_id = 'player-zoe'`,
		`UPDATE training_entries SET idempotency_key = 'entry-key-1', assignment_id = 'assignment-hill-sprints'
		 WHERE id = 'entry-mason-recent'`,
		`UPDATE training_entries SET deleted_at = '2026-08-01T00:00:00Z' WHERE id = 'entry-mason-expired'`,
		`INSERT INTO reactions (
			id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, context_metric, team_day, idempotency_key,
			created_at, read_at, deleted_at, remaining_after_send
		) VALUES (
			'reaction-read', 'player-ava', 'player-mason', 'team-hill-striders', 'clap',
			'team_progress', 'weekly', NULL, '2026-08-01', 'reaction-key-1',
			'2026-08-01T12:00:00Z', '2026-08-01T13:00:00Z', NULL, 3
		)`,
		`INSERT INTO reactions (
			id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, context_metric, team_day, idempotency_key,
			created_at, read_at, deleted_at, remaining_after_send
		) VALUES (
			'reaction-deleted', 'player-liam', 'player-mason', 'team-hill-striders', 'fire',
			'leaderboard', 'season', 'effort', '2026-08-02', 'reaction-key-2',
			'2026-08-02T12:00:00Z', NULL, '2026-08-03T00:00:00Z', 0
		)`,
		`INSERT INTO auth_credentials (
			id, account_id, selector_hash, verifier_salt, verifier_hash,
			failed_attempts, locked_until, issued_at, last_used_at, revoked_at
		) VALUES (
			'credential-ava', 'account-ava', X'0102030405', X'0607', X'08090a0b',
			2, '2026-08-04T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z', NULL
		)`,
		`INSERT INTO auth_credentials (
			id, account_id, selector_hash, verifier_salt, verifier_hash,
			failed_attempts, issued_at, revoked_at
		) VALUES (
			'credential-mason', 'account-mason', X'ff00ff', X'00', X'0000',
			0, '2026-08-01T00:00:00Z', '2026-08-05T00:00:00Z'
		)`,
		`INSERT INTO auth_sessions (
			id, account_id, credential_id, token_hash, created_at, expires_at, last_seen_at, revoked_at
		) VALUES (
			'session-ava', 'account-ava', 'credential-ava', X'aabbccdd',
			'2026-08-03T00:00:00Z', '2026-08-10T00:00:00Z', '2026-08-03T01:00:00Z', NULL
		)`,
		`INSERT INTO auth_audit_events (id, account_id, credential_id, session_id, event_type, detail_code, occurred_at)
		 VALUES ('audit-login', 'account-ava', 'credential-ava', 'session-ava', 'login_succeeded', NULL, '2026-08-03T00:00:00Z')`,
		`INSERT INTO auth_audit_events (id, account_id, credential_id, session_id, event_type, detail_code, occurred_at)
		 VALUES ('audit-anonymous', NULL, NULL, NULL, 'login_failed', 'unknown_selector', '2026-08-03T00:00:01Z')`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}
	return databaseURL
}

func seedOlderSchemaRows(t *testing.T, ctx context.Context, databaseURL string) {
	t.Helper()
	db := openDatabase(t, ctx, databaseURL)
	statements := []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-old', 'Old Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-old', 'club-old', 'Old Team', 'season-2025', 3, 'America/Chicago', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-old', 'club-old', 'Old', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) VALUES ('entry-old', 'player-old', 'team-old', 'hill-sprints', '2026-01-02T00:00:00Z',
			8, 'reps', 4, 3, '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z')`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed older row %q: %v", statement, err)
		}
	}
}

func openDatabase(t *testing.T, ctx context.Context, databaseURL string) *sql.DB {
	t.Helper()
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// Renders a table as sorted type-tagged strings so two databases compare without a schema.
func readTableRows(t *testing.T, ctx context.Context, db *sql.DB, table string) []string {
	t.Helper()
	rows, err := db.QueryContext(ctx, "SELECT * FROM "+table)
	if err != nil {
		t.Fatalf("read %s: %v", table, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	var rendered []string
	for rows.Next() {
		values := make([]any, len(columns))
		destinations := make([]any, len(columns))
		for index := range values {
			destinations[index] = &values[index]
		}
		if err := rows.Scan(destinations...); err != nil {
			t.Fatal(err)
		}
		var builder strings.Builder
		for index, column := range columns {
			fmt.Fprintf(&builder, "%s=%#v;", column, values[index])
		}
		rendered = append(rendered, builder.String())
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	sort.Strings(rendered)
	return rendered
}

// Refreshes SHA256SUMS but not the manifest digests, so a caller chooses whether
// it is forging a consistent archive or a corrupt one.
func rewriteLogicalArchive(t *testing.T, sourcePath, destinationPath string, mutate func(files map[string][]byte)) {
	t.Helper()
	files := map[string][]byte{}
	var order []string
	source, err := os.Open(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	gzipReader, err := gzip.NewReader(source)
	if err != nil {
		t.Fatal(err)
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		contents, err := io.ReadAll(tarReader)
		if err != nil {
			t.Fatal(err)
		}
		files[header.Name] = contents
		order = append(order, header.Name)
	}

	mutate(files)

	var checksums strings.Builder
	for _, name := range order {
		if name == "SHA256SUMS" {
			continue
		}
		digest := sha256.Sum256(files[name])
		fmt.Fprintf(&checksums, "%s  %s\n", hex.EncodeToString(digest[:]), name)
	}
	files["SHA256SUMS"] = []byte(checksums.String())

	destination, err := os.Create(destinationPath)
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	gzipWriter := gzip.NewWriter(destination)
	tarWriter := tar.NewWriter(gzipWriter)
	for _, name := range order {
		if err := tarWriter.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(files[name]))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tarWriter.Write(files[name]); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
}

// Forges what a future build would emit: a fully consistent archive whose only
// problem is that this build does not know the field.
func addUnknownField(t *testing.T, files map[string][]byte, table, field, jsonValue string) {
	t.Helper()
	path := "tables/" + table + ".jsonl"
	var rebuilt bytes.Buffer
	for _, line := range strings.Split(strings.TrimSuffix(string(files[path]), "\n"), "\n") {
		rebuilt.WriteString(strings.TrimSuffix(line, "}"))
		fmt.Fprintf(&rebuilt, ",%q:%s}\n", field, jsonValue)
	}
	files[path] = rebuilt.Bytes()

	var manifest map[string]any
	if err := json.Unmarshal(files["manifest.json"], &manifest); err != nil {
		t.Fatal(err)
	}
	for _, entry := range manifest["tables"].([]any) {
		descriptor := entry.(map[string]any)
		if descriptor["name"] != table {
			continue
		}
		descriptor["fields"] = append(descriptor["fields"].([]any), field)
		digest := sha256.Sum256(files[path])
		descriptor["sha256"] = hex.EncodeToString(digest[:])
		descriptor["bytes"] = float64(len(files[path]))
	}
	rewritten, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	files["manifest.json"] = append(rewritten, '\n')
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
