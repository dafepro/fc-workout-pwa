package staffauth

import (
	"context"
	"testing"
	"time"
)

func TestCoachAuthorityUsesEachTeamCalendarIncludingTheFinalDay(t *testing.T) {
	for _, zone := range []string{"UTC", "Pacific/Kiritimati", "America/Los_Angeles"} {
		for _, instant := range []string{"2026-08-08T00:00:00Z", "2026-08-08T12:00:00Z", "2026-11-01T08:59:59Z", "2026-11-01T09:00:00Z"} {
			t.Run(zone+"/"+instant, func(t *testing.T) {
				now, _ := time.Parse(time.RFC3339, instant)
				service, db := newService(t, &now)
				ctx := context.Background()
				for _, sql := range []string{
					`INSERT INTO clubs (id, name, created_at) VALUES ('club', 'Club', '2026-01-01T00:00:00Z')`,
					`INSERT INTO accounts (id, club_id, role, status, created_at) VALUES ('coach', 'club', 'coach', 'active', '2026-01-01T00:00:00Z')`,
				} {
					if _, err := db.ExecContext(ctx, sql); err != nil {
						t.Fatal(err)
					}
				}
				location, err := time.LoadLocation(zone)
				if err != nil {
					t.Fatal(err)
				}
				today := now.In(location).Format("2006-01-02")
				for _, teamID := range []string{"today", "future", "expired"} {
					if _, err := db.ExecContext(ctx, `INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
					 VALUES (?, 'club', ?, '2026', 3, ?, '2026-01-01T00:00:00Z')`, teamID, teamID, zone); err != nil {
						t.Fatal(err)
					}
				}
				if _, err := db.ExecContext(ctx, `INSERT INTO coach_team_assignments (team_id, account_id, active_from, active_to) VALUES
				 ('today', 'coach', ?, ?), ('future', 'coach', ?, NULL), ('expired', 'coach', '2026-01-01', ?)`,
					today, today, now.In(location).AddDate(0, 0, 1).Format("2006-01-02"), now.In(location).AddDate(0, 0, -1).Format("2006-01-02")); err != nil {
					t.Fatal(err)
				}
				token, err := service.mintSession(ctx, "coach", now)
				if err != nil {
					t.Fatal(err)
				}
				actor, err := service.Authenticate(ctx, token)
				if err != nil {
					t.Fatal(err)
				}
				if len(actor.AssignedTeamIDs) != 1 || actor.AssignedTeamIDs[0] != "today" {
					t.Fatalf("assigned=%v want only today's inclusive interval", actor.AssignedTeamIDs)
				}
			})
		}
	}
}
