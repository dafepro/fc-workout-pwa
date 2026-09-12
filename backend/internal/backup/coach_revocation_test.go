package backup_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
)

func TestLegacyLogicalImportKeepsRemovedCoachAuthorityRevoked(t *testing.T) {
	ctx := context.Background()
	databaseURL := olderDatabase(t, ctx)
	seedOlderSchemaRows(t, ctx, databaseURL)
	source := openDatabase(t, ctx, databaseURL)
	for _, statement := range []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('coach-old', 'club-old', 'coach', 'active', '2026-01-01T00:00:00Z')`,
		`INSERT INTO coach_team_assignments (team_id, account_id, active_from, active_to)
		 VALUES ('team-old', 'coach-old', '2026-01-01', '2026-08-08'),
		 ('team-old', 'coach-old', '2026-08-09', NULL)`,
	} {
		if _, err := source.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	archive := filepath.Join(t.TempDir(), "legacy.tar.gz")
	if _, err := backup.ExportLogical(ctx, backup.LogicalExportOptions{DatabaseURL: databaseURL, ArchivePath: archive}); err != nil {
		t.Fatal(err)
	}
	targetPath := filepath.Join(t.TempDir(), "restored.db")
	if _, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{ArchivePath: archive, DatabasePath: targetPath}); err != nil {
		t.Fatal(err)
	}
	target := openDatabase(t, ctx, "file:"+filepath.ToSlash(targetPath))
	var end, revoked sql.NullString
	if err := target.QueryRowContext(ctx, `SELECT active_to, revoked_at FROM coach_team_assignments WHERE active_from = '2026-01-01'`).Scan(&end, &revoked); err != nil {
		t.Fatal(err)
	}
	if end.String != "2026-08-08" || !revoked.Valid {
		t.Fatalf("legacy closed interval end=%v revoked=%v; history and revocation must survive", end, revoked)
	}
	if err := target.QueryRowContext(ctx, `SELECT revoked_at FROM coach_team_assignments WHERE active_from = '2026-08-09'`).Scan(&revoked); err != nil {
		t.Fatal(err)
	}
	if revoked.Valid {
		t.Fatal("legacy active assignment was revoked during import")
	}
}
