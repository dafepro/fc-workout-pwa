package httpapi_test

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPlayerHTTPSessionAndDashboardAgreeOnLocalMembership(t *testing.T) {
	db, err := database.Open(t.Context(), "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "calendar.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	const token = "local-calendar-session"
	hash := sha256.Sum256([]byte(token))
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'One', ?)`, []any{stamp}},
		{`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'Player', 'A', '{}', ?)`, []any{stamp}},
		{`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-one', 'club-one', 'player-one', 'player', 'active', ?)`, []any{stamp}},
		{`INSERT INTO auth_credentials (id, account_id, selector_hash, verifier_salt, verifier_hash, issued_at) VALUES ('credential-one', 'account-one', ?, ?, ?, ?)`, []any{[]byte("selector"), []byte("salt"), []byte("verifier"), stamp}},
		{`INSERT INTO auth_sessions (id, account_id, credential_id, token_hash, created_at, expires_at, last_seen_at) VALUES ('session-one', 'account-one', 'credential-one', ?, ?, ?, ?)`, []any{hash[:], stamp, now.Add(time.Hour).Format(time.RFC3339Nano), stamp}},
	} {
		if _, err = db.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	for _, team := range []struct{ id, zone string }{
		{"day-ahead", "Pacific/Kiritimati"},
		{"day-behind", "Pacific/Honolulu"},
	} {
		location, err := time.LoadLocation(team.zone)
		if err != nil {
			t.Fatal(err)
		}
		today := now.In(location).Format(time.DateOnly)
		if _, err = db.Exec(`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES (?, 'club-one', ?, '2026', 3, ?, ?)`, team.id, team.id, team.zone, stamp); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO team_memberships (team_id, player_id, active_from, active_to) VALUES (?, 'player-one', ?, ?)`, team.id, today, today); err != nil {
			t.Fatal(err)
		}
	}
	// Opposite sides of the date line guarantee UTC disagrees with a team today.
	sessions := authn.NewService(db)
	server := httptest.NewServer(httpapi.NewHandler(config.Config{},
		httpapi.WithSessionManager(sessions), httpapi.WithAuthenticator(sessions),
		httpapi.WithStore(store.New(db, time.UTC)), httpapi.WithClock(func() time.Time { return now })))
	t.Cleanup(server.Close)
	get := func(path string, want int, result any) {
		t.Helper()
		req, err := http.NewRequest(http.MethodGet, server.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		response, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != want {
			t.Fatalf("%s status=%d, want %d", path, response.StatusCode, want)
		}
		if result != nil {
			if err = json.NewDecoder(response.Body).Decode(result); err != nil {
				t.Fatal(err)
			}
		}
	}
	var session authn.Session
	get("/v1/auth/session", http.StatusOK, &session)
	if session.Player == nil || len(session.Player.Teams) != 2 {
		t.Fatalf("both local memberships must reach the player session: %+v", session.Player)
	}
	for _, team := range session.Player.Teams {
		var dashboard store.TrainingDashboardProjection
		get("/v1/me/training-dashboard?teamId="+team.ID, http.StatusOK, &dashboard)
		if dashboard.Team.ID != team.ID {
			t.Fatalf("session team %q did not reach its dashboard", team.ID)
		}
	}
	if _, err = db.Exec(`DELETE FROM team_memberships WHERE player_id = 'player-one'`); err != nil {
		t.Fatal(err)
	}
	get("/v1/auth/session", http.StatusOK, &session)
	if len(session.Player.Teams) != 0 {
		t.Fatal("session retained a revoked membership")
	}
	get("/v1/me/training-dashboard?teamId=day-ahead", http.StatusNotFound, nil)
}
