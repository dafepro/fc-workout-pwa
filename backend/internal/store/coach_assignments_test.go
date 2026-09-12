package store

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestCoachRevocationPreservesInclusiveTeamDatesAndAllowsReassignment(t *testing.T) {
	for _, test := range []struct{ zone, instant string }{
		{"UTC", "2026-08-08T12:00:00Z"},
		{"Pacific/Kiritimati", "2026-08-08T09:59:59Z"},
		{"Pacific/Kiritimati", "2026-08-08T10:00:00Z"},
		{"America/Los_Angeles", "2026-08-08T06:59:59Z"},
		{"America/Los_Angeles", "2026-08-08T07:00:00Z"},
	} {
		t.Run(test.zone+"/"+test.instant, func(t *testing.T) {
			ctx := context.Background()
			db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "coaches.db")))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = db.Close() })
			if err = database.Migrate(ctx, db); err != nil {
				t.Fatal(err)
			}
			for _, statement := range []string{
				`INSERT INTO clubs (id, name, created_at) VALUES ('club', 'Club', '2026-01-01T00:00:00Z')`,
				`INSERT INTO accounts (id, club_id, role, status, created_at)
				 VALUES ('coach', 'club', 'coach', 'active', '2026-01-01T00:00:00Z')`,
			} {
				if _, err = db.ExecContext(ctx, statement); err != nil {
					t.Fatal(err)
				}
			}
			if _, err = db.ExecContext(ctx, `INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
			 VALUES ('team', 'club', 'Team', '2026', 3, ?, '2026-01-01T00:00:00Z')`, test.zone); err != nil {
				t.Fatal(err)
			}
			now, _ := time.Parse(time.RFC3339, test.instant)
			location, _ := time.LoadLocation(test.zone)
			today := now.In(location).Format("2006-01-02")
			staff := NewStaffStore(db)
			staff.now = func() time.Time { return now }
			for range 2 {
				if err = staff.AssignCoach(ctx, "coach", "team"); err != nil {
					t.Fatal(err)
				}
				if err = staff.AssignCoach(ctx, "coach", "team"); !errors.Is(err, ErrStaffInvalid) {
					t.Fatalf("duplicate active assignment: %v", err)
				}
				if err = staff.UnassignCoach(ctx, "coach", "team"); err != nil {
					t.Fatal(err)
				}
				var from, to, revoked string
				if err = db.QueryRowContext(ctx, `SELECT active_from, active_to, revoked_at FROM coach_team_assignments`).Scan(&from, &to, &revoked); err != nil {
					t.Fatal(err)
				}
				if from != today || to != today || revoked != now.Format(time.RFC3339Nano) {
					t.Fatalf("from=%s to=%s revoked=%s want date=%s instant=%s", from, to, revoked, today, test.instant)
				}
				if err = staff.UnassignCoach(ctx, "coach", "team"); !errors.Is(err, ErrStaffNotFound) {
					t.Fatalf("already revoked assignment: %v", err)
				}
			}
			// A pre-scheduled inclusive end must not prevent an earlier explicit removal.
			if _, err = db.ExecContext(ctx, `UPDATE coach_team_assignments SET revoked_at = NULL, active_to = ?`,
				now.In(location).AddDate(0, 0, 3).Format("2006-01-02")); err != nil {
				t.Fatal(err)
			}
			if err = staff.UnassignCoach(ctx, "coach", "team"); err != nil {
				t.Fatal(err)
			}
			now = now.AddDate(0, 0, 1)
			if err = staff.AssignCoach(ctx, "coach", "team"); err != nil {
				t.Fatal(err)
			}
			var oldEnd string
			var oldRevoked, newRevoked sql.NullString
			if err = db.QueryRowContext(ctx, `SELECT active_to, revoked_at FROM coach_team_assignments WHERE active_from = ?`, today).Scan(&oldEnd, &oldRevoked); err != nil {
				t.Fatal(err)
			}
			if err = db.QueryRowContext(ctx, `SELECT revoked_at FROM coach_team_assignments WHERE active_from > ?`, today).Scan(&newRevoked); err != nil {
				t.Fatal(err)
			}
			if oldEnd != today || !oldRevoked.Valid || newRevoked.Valid {
				t.Fatal("later reassignment rewrote a previous day's closed interval")
			}
		})
	}
}
