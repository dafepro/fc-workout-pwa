package httpapi_test

import (
	"context"
	"crypto/sha256"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestCoachRemovalRevokesAnExistingHTTPSessionImmediately(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "coach-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-one', 'club-one', 'First team', '2026', 3, 'UTC', '2026-01-01T00:00:00Z'),
		 ('team-two', 'club-one', 'Second team', '2026', 3, 'America/Los_Angeles', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z'),
		 ('operator', NULL, 'platform_admin', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	for _, accountID := range []string{"coach", "operator"} {
		hash := sha256.Sum256([]byte(accountID))
		if _, err = db.ExecContext(ctx, `INSERT INTO staff_sessions
		 (id, account_id, token_hash, created_at, expires_at, idle_expires_at, authenticated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`, accountID, accountID, hash[:], now.Format(time.RFC3339Nano),
			now.Add(time.Hour).Format(time.RFC3339Nano), now.Add(time.Hour).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
	}
	staff := store.NewStaffStore(db)
	for _, teamID := range []string{"team-one", "team-two"} {
		if err = staff.AssignCoach(ctx, "coach", teamID); err != nil {
			t.Fatal(err)
		}
	}
	auth := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
	server := httptest.NewServer(httpapi.NewHandler(config.Config{},
		httpapi.WithAuthenticator(auth), httpapi.WithStaffRepository(staff), httpapi.WithStaffAccountManager(auth)))
	t.Cleanup(server.Close)
	request := func(token, method, path, body string, want int) string {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		response, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != want {
			t.Errorf("%s %s status=%d want=%d body=%s", method, path, response.StatusCode, want, data)
		}
		return string(data)
	}
	request("coach", http.MethodGet, "/v1/staff/teams/team-one/roster", "", http.StatusOK)
	request("operator", http.MethodDelete, "/v1/staff/accounts/coach/team-assignments/team-one", "", http.StatusNoContent)
	request("coach", http.MethodGet, "/v1/staff/teams/team-one/roster", "", http.StatusForbidden)
	request("coach", http.MethodPost, "/v1/staff/teams/team-one/assignments",
		`{"catalogKey":"hill_sprints_8x6","targetValue":6,"targetUnit":"reps","startsOn":"2099-01-01","dueOn":"2099-01-07"}`, http.StatusForbidden)
	listed := request("coach", http.MethodGet, "/v1/staff/teams", "", http.StatusOK)
	if strings.Contains(listed, `"team-one"`) || !strings.Contains(listed, `"team-two"`) {
		t.Errorf("team list retained revoked authority or lost another team: %s", listed)
	}
	request("coach", http.MethodGet, "/v1/staff/teams/team-two/roster", "", http.StatusOK)
	request("operator", http.MethodPost, "/v1/staff/accounts/coach/team-assignments", `{"teamId":"team-one"}`, http.StatusNoContent)
	request("coach", http.MethodGet, "/v1/staff/teams/team-one/roster", "", http.StatusOK)
	request("operator", http.MethodDelete, "/v1/staff/accounts/coach/team-assignments/team-one", "", http.StatusNoContent)
	request("coach", http.MethodGet, "/v1/staff/teams/team-one/roster", "", http.StatusForbidden)
}
