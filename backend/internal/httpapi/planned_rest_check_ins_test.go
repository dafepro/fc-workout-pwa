package httpapi_test

import (
	"bytes"
	"context"
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

func TestPlannedRestRouteCreatesAndReplaysTodaysCheckIn(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "planned-rest-http.db")))
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
		 VALUES ('team-one', 'club-one', 'Team', 'season', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	today := time.Now().UTC()
	plan, err := store.NewStaffStore(db).PublishTrainingPlan(ctx, "team-one", store.TrainingPlanInput{
		TemplateID: "speed-recovery-v1", StartsOn: today.AddDate(0, 0, -3).Format("2006-01-02"),
	})
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)
	body := `{"teamId":"team-one","planId":"` + plan.ID + `","dayIndex":3}`

	created := plannedRestRequest(handler, body, "rest-key")
	if created.Code != http.StatusCreated || !strings.Contains(created.Body.String(), `"occursOn":"`+today.Format("2006-01-02")+`"`) {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	replayed := plannedRestRequest(handler, body, "rest-key")
	if replayed.Code != http.StatusOK {
		t.Fatalf("replay status=%d body=%s", replayed.Code, replayed.Body.String())
	}
	invalid := plannedRestRequest(handler,
		`{"teamId":"team-one","planId":"`+plan.ID+`","dayIndex":2}`, "wrong-day")
	if invalid.Code != http.StatusUnprocessableEntity || !strings.Contains(invalid.Body.String(), `"planned_rest_unavailable"`) {
		t.Fatalf("wrong day status=%d body=%s", invalid.Code, invalid.Body.String())
	}
}

func plannedRestRequest(handler http.Handler, body, key string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/v1/me/planned-rest-check-ins", bytes.NewBufferString(body))
	request.Header.Set("Authorization", "Bearer player")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", key)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
