package authn

import (
	"reflect"
	"testing"
	"time"
)

func TestSessionMembershipUsesEachTeamsCalendar(t *testing.T) {
	for _, test := range []struct {
		name, now, zone, start, end string
		active                      bool
	}{
		{"Chicago before local end", "2026-10-03T00:00:00Z", "America/Chicago", "2026-10-02", "2026-10-02", true},
		{"Chicago before local start", "2026-10-03T00:00:00Z", "America/Chicago", "2026-10-03", "", false},
		{"Chicago at local start", "2026-10-03T05:00:00Z", "America/Chicago", "2026-10-03", "", true},
		{"Chicago at local end", "2026-10-03T05:00:00Z", "America/Chicago", "2026-10-02", "2026-10-02", false},
		{"Auckland next day", "2026-10-02T11:00:00Z", "Pacific/Auckland", "2026-10-03", "2026-10-03", true},
		{"Honolulu before local end", "2026-10-03T09:59:59Z", "Pacific/Honolulu", "2026-10-02", "2026-10-02", true},
		{"Honolulu at local end", "2026-10-03T10:00:00Z", "Pacific/Honolulu", "2026-10-02", "2026-10-02", false},
		{"DST day before local end", "2026-03-09T04:59:59Z", "America/Chicago", "2026-03-08", "2026-03-08", true},
		{"DST day at local end", "2026-03-09T05:00:00Z", "America/Chicago", "2026-03-08", "2026-03-08", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			service, db := sessionService(t)
			token := seedPlayerSession(t, db, `{}`)
			now, err := time.Parse(time.RFC3339, test.now)
			if err != nil {
				t.Fatal(err)
			}
			service.now = func() time.Time { return now }
			if _, err := db.Exec(`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'One', 'season-one', 3, ?, ?)`, test.zone, test.now); err != nil {
				t.Fatal(err)
			}
			var end any
			if test.end != "" {
				end = test.end
			}
			if _, err := db.Exec(`INSERT INTO team_memberships (team_id, player_id, active_from, active_to) VALUES ('team-one', 'player-one', ?, ?)`, test.start, end); err != nil {
				t.Fatal(err)
			}
			session, err := service.Session(t.Context(), token)
			if err != nil {
				t.Fatal(err)
			}
			if active := len(session.Player.Teams) == 1; active != test.active {
				t.Fatalf("teams = %+v, want active = %v", session.Player.Teams, test.active)
			}
		})
	}
}

func TestSessionProjectsOppositeCalendarsWithStableTies(t *testing.T) {
	service, db := sessionService(t)
	token := seedPlayerSession(t, db, `{}`)
	now := time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }
	for _, team := range []struct{ id, zone, day string }{
		{"team-b", "Pacific/Auckland", "2026-10-03"},
		{"team-a", "Pacific/Honolulu", "2026-10-02"},
	} {
		if _, err := db.Exec(`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES (?, 'club-one', 'Same name', 'season-one', 3, ?, ?)`, team.id, team.zone, now.Format(time.RFC3339)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO team_memberships (team_id, player_id, active_from, active_to) VALUES (?, 'player-one', ?, ?)`, team.id, team.day, team.day); err != nil {
			t.Fatal(err)
		}
	}
	session, err := service.Session(t.Context(), token)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, team := range session.Player.Teams {
		ids = append(ids, team.ID)
	}
	if !reflect.DeepEqual(ids, []string{"team-a", "team-b"}) {
		t.Fatalf("teams = %v, want both local memberships in stable order", ids)
	}
}

func TestSessionRejectsInvalidTeamCalendar(t *testing.T) {
	service, db := sessionService(t)
	token := seedPlayerSession(t, db, `{}`)
	if _, err := db.Exec(`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'One', 'season-one', 3, 'invalid/timezone', '2026-01-01')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Session(t.Context(), token); err == nil {
		t.Fatal("invalid team calendar must not silently use UTC")
	}
}
