package httpapi_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamRewardRoutesPublishIdempotentlyAndExposeSafeAggregateReads(t *testing.T) {
	db := teamRewardHTTPDB(t)
	staff := store.NewStaffStore(db)
	playerStore := store.New(db, time.UTC)
	coach := domain.Actor{
		AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one",
		AssignedTeamIDs: []string{"team-one"},
	}
	staffHandler := httpapi.NewHandler(config.Config{EnableDevAccess: true},
		httpapi.WithStore(playerStore), httpapi.WithStaffRepository(staff),
		httpapi.WithAuthenticator(socialAuthenticator{actor: coach}),
	)
	definitions := teamRewardRequest(staffHandler, http.MethodGet, "/v1/staff/team-reward-definitions", "", "")
	if definitions.Code != http.StatusOK || !strings.Contains(definitions.Body.String(), `"id":"team-celebration-v1"`) {
		t.Fatalf("definitions status=%d body=%s", definitions.Code, definitions.Body.String())
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	body := fmt.Sprintf(`{"definitionId":"team-celebration-v1","startsOn":"%s","endsOn":"%s","requiredDays":2,"minimumRosterPercent":60}`,
		today.Format("2006-01-02"), today.AddDate(0, 0, 2).Format("2006-01-02"))

	published := teamRewardRequest(staffHandler, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "publish-key")
	if published.Code != http.StatusCreated || !strings.Contains(published.Body.String(), `"title":"Team celebration"`) {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}
	var publishedReward store.TeamReward
	if err := json.Unmarshal(published.Body.Bytes(), &publishedReward); err != nil || publishedReward.ID == "" {
		t.Fatalf("decode published reward: %+v, %v", publishedReward, err)
	}
	replayed := teamRewardRequest(staffHandler, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "publish-key")
	if replayed.Code != http.StatusOK || replayed.Body.String() != published.Body.String() {
		t.Fatalf("replay status=%d body=%s want=%s", replayed.Code, replayed.Body.String(), published.Body.String())
	}
	staffRead := teamRewardRequest(staffHandler, http.MethodGet, "/v1/staff/teams/team-one/team-reward", "", "")
	if staffRead.Code != http.StatusOK || !strings.Contains(staffRead.Body.String(), `"activePlayers":1`) {
		t.Fatalf("staff read status=%d body=%s", staffRead.Code, staffRead.Body.String())
	}

	legacyPlayerRead := teamRewardRequest(staffHandler, http.MethodGet, "/v1/teams/team-one/team-reward", "", "")
	if legacyPlayerRead.Code != http.StatusNotFound {
		t.Fatalf("legacy player route status=%d body=%s", legacyPlayerRead.Code, legacyPlayerRead.Body.String())
	}
	cancelPath := "/v1/staff/teams/team-one/team-reward/" + publishedReward.ID + "/cancel"
	cancelled := teamRewardRequest(staffHandler, http.MethodPost, cancelPath, "", "")
	if cancelled.Code != http.StatusOK || !strings.Contains(cancelled.Body.String(), `"status":"cancelled"`) {
		t.Fatalf("cancel status=%d body=%s", cancelled.Code, cancelled.Body.String())
	}
	stale := teamRewardRequest(staffHandler, http.MethodPost, cancelPath, "", "")
	if stale.Code != http.StatusConflict || !strings.Contains(stale.Body.String(), `"team_reward_changed"`) {
		t.Fatalf("stale cancel status=%d body=%s", stale.Code, stale.Body.String())
	}
}

func TestTeamRewardAuthoringRoutesAreDevelopmentOnlyAndTeamAuthorized(t *testing.T) {
	db := teamRewardHTTPDB(t)
	staff := store.NewStaffStore(db)
	playerStore := store.New(db, time.UTC)
	production := httpapi.NewHandler(config.Config{}, httpapi.WithStore(playerStore),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}),
	)
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/v1/staff/team-reward-definitions"},
		{http.MethodPost, "/v1/staff/teams/team-one/team-reward"},
		{http.MethodPost, "/v1/staff/teams/team-one/team-reward/reward-one/cancel"},
	} {
		response := teamRewardRequest(production, route.method, route.path, `{}`, "key")
		if response.Code != http.StatusNotFound {
			t.Fatalf("production authoring route %s status=%d body=%s", route.path, response.Code, response.Body.String())
		}
	}

	unassigned := httpapi.NewHandler(config.Config{EnableDevAccess: true}, httpapi.WithStore(playerStore),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one",
		}}),
	)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	body := fmt.Sprintf(`{"definitionId":"team-celebration-v1","startsOn":"%s","endsOn":"%s","requiredDays":1,"minimumRosterPercent":60}`,
		today.Format("2006-01-02"), today.AddDate(0, 0, 1).Format("2006-01-02"))
	response := teamRewardRequest(unassigned, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "key")
	if response.Code != http.StatusForbidden {
		t.Fatalf("unassigned publish status=%d body=%s", response.Code, response.Body.String())
	}
}

func teamRewardHTTPDB(t *testing.T) *sql.DB {
	t.Helper()
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "team-rewards-http.db")))
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
		 VALUES ('team-one', 'club-one', 'Team', 'season-one', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from)
		 VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func teamRewardRequest(handler http.Handler, method, path, body, key string) *httptest.ResponseRecorder {
	var request *http.Request
	if body == "" {
		request = httptest.NewRequest(method, path, nil)
	} else {
		request = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Authorization", "Bearer test")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
