package httpapi_test

import (
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

func TestLegacyDailyDropRoutesAreRetired(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "daily-drop-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	handler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)

	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/v1/me/daily-drop", nil),
		httptest.NewRequest(http.MethodPost, "/v1/me/daily-drop/claim", nil),
	} {
		request.Header.Set("Authorization", "Bearer player")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s %s status=%d body=%s", request.Method, request.URL.Path, response.Code, response.Body.String())
		}
	}

	var trainingEntries int
	if err := db.QueryRow(`SELECT COUNT(*) FROM training_entries WHERE player_id = 'player-one'`).Scan(&trainingEntries); err != nil {
		t.Fatal(err)
	}
	if trainingEntries != 0 {
		t.Fatalf("retired daily drop route created %d training entries", trainingEntries)
	}
}

func TestPrizeBoxRoutesKeepClaimAndOpenSeparate(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "prize-box-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	handler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)

	claim := httptest.NewRequest(http.MethodPost, "/v1/me/prize-boxes/claim-daily", nil)
	claim.Header.Set("Authorization", "Bearer player")
	claim.Header.Set("Idempotency-Key", "claim-daily")
	claimResponse := httptest.NewRecorder()
	handler.ServeHTTP(claimResponse, claim)
	if claimResponse.Code != http.StatusCreated || strings.Contains(claimResponse.Body.String(), `"item"`) {
		t.Fatalf("claim status=%d body=%s", claimResponse.Code, claimResponse.Body.String())
	}
	var claimBody struct {
		Box struct {
			ID string `json:"id"`
		} `json:"box"`
	}
	if err = json.Unmarshal(claimResponse.Body.Bytes(), &claimBody); err != nil {
		t.Fatal(err)
	}

	overview := httptest.NewRequest(http.MethodGet, "/v1/me/prize-boxes", nil)
	overview.Header.Set("Authorization", "Bearer player")
	overviewResponse := httptest.NewRecorder()
	handler.ServeHTTP(overviewResponse, overview)
	if overviewResponse.Code != http.StatusOK || !strings.Contains(overviewResponse.Body.String(), `"readyCount":1`) {
		t.Fatalf("overview status=%d body=%s", overviewResponse.Code, overviewResponse.Body.String())
	}

	open := httptest.NewRequest(http.MethodPost, "/v1/me/prize-boxes/"+claimBody.Box.ID+"/open", nil)
	open.Header.Set("Authorization", "Bearer player")
	open.Header.Set("Idempotency-Key", "open-daily")
	openResponse := httptest.NewRecorder()
	handler.ServeHTTP(openResponse, open)
	if openResponse.Code != http.StatusCreated || !strings.Contains(openResponse.Body.String(), `"item"`) ||
		!strings.Contains(openResponse.Body.String(), `"rarity"`) {
		t.Fatalf("open status=%d body=%s", openResponse.Code, openResponse.Body.String())
	}
}
