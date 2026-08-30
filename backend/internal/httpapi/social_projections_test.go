package httpapi_test

import (
	"context"
	"io"
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

type socialAuthenticator struct {
	actor domain.Actor
}

func (auth socialAuthenticator) Authenticate(context.Context, string) (domain.Actor, error) {
	return auth.actor, nil
}

func TestSocialProjectionRoutesAreAuthenticatedSafeAndValidated(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "social-http.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'America/Chicago', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mason', 'club-one', 'Mason', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-mason', '2026-01-01')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	handler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
		}}),
	)

	for _, path := range []string{
		"/v1/teams/team-one/activity",
		"/v1/teams/team-one/hub",
		"/v1/teams/team-one/leaderboards?period=weekly&metric=effort",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer test-session")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d, body = %s", path, response.Code, response.Body.String())
		}
		body := response.Body.String()
		for _, privateField := range []string{"resultValue", "resultUnit", "exhaustionLevel", "occurredAt", "assessment"} {
			if strings.Contains(body, privateField) {
				t.Fatalf("%s leaked %q: %s", path, privateField, body)
			}
		}
	}

	invalid := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/leaderboards?period=forever&metric=speed", nil)
	invalid.Header.Set("Authorization", "Bearer test-session")
	invalidResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidResponse, invalid)
	if invalidResponse.Code != http.StatusBadRequest {
		body, _ := io.ReadAll(invalidResponse.Result().Body)
		t.Fatalf("invalid query status = %d, body = %s", invalidResponse.Code, body)
	}
}
