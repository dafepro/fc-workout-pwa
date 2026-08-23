package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
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

func TestTeamRewardRoutesAuthorizeStaffAndReturnAPlayerSafeProjection(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "rewards-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at) VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	repository := store.New(db, time.UTC)
	staffHandler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}),
	)
	create := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/rewards", bytes.NewBufferString(`{
		"prizeTitle":"Pizza after practice","prizeDescription":"Celebrate together.","startsOn":"2026-08-23",
		"rule":{"version":1,"kind":"qualifying_team_days","participationScope":"any_approved_workout","requiredDays":3,"minimumRosterPercent":80}}
	`))
	create.Header.Set("Authorization", "Bearer staff")
	create.Header.Set("Content-Type", "application/json")
	created := httptest.NewRecorder()
	staffHandler.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", created.Code, created.Body.String())
	}
	id := jsonStringField(t, created.Body.String(), "id")
	publish := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/rewards/"+id+"/publish", nil)
	publish.Header.Set("Authorization", "Bearer staff")
	published := httptest.NewRecorder()
	staffHandler.ServeHTTP(published, publish)
	if published.Code != http.StatusOK {
		t.Fatalf("publish status = %d body=%s", published.Code, published.Body.String())
	}

	playerHandler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)
	get := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/reward", nil)
	get.Header.Set("Authorization", "Bearer player")
	response := httptest.NewRecorder()
	playerHandler.ServeHTTP(response, get)
	if response.Code != http.StatusOK {
		t.Fatalf("player status = %d body=%s", response.Code, response.Body.String())
	}
	for _, private := range []string{`"createdByAccountId"`, `"days":`, `"activePlayers"`, `"qualifyingPlayers"`} {
		if strings.Contains(response.Body.String(), private) {
			t.Fatalf("player projection leaked %q: %s", private, response.Body.String())
		}
	}
}

func jsonStringField(t *testing.T, body, field string) string {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(body), &value); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	result, found := value[field].(string)
	if !found || result == "" {
		t.Fatalf("field %q missing from %s", field, body)
	}
	return result
}
