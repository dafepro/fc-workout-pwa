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

func TestDailyDropRoutesClaimWithoutTrainingAndReturnTheUnlockedCollection(t *testing.T) {
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

	statusRequest := httptest.NewRequest(http.MethodGet, "/v1/me/daily-drop", nil)
	statusRequest.Header.Set("Authorization", "Bearer player")
	statusResponse := httptest.NewRecorder()
	handler.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK || !strings.Contains(statusResponse.Body.String(), `"state":"available"`) {
		t.Fatalf("status=%d body=%s", statusResponse.Code, statusResponse.Body.String())
	}

	missingKey := httptest.NewRequest(http.MethodPost, "/v1/me/daily-drop/claim", nil)
	missingKey.Header.Set("Authorization", "Bearer player")
	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingKey)
	if missingResponse.Code != http.StatusBadRequest {
		t.Fatalf("missing key status=%d body=%s", missingResponse.Code, missingResponse.Body.String())
	}

	claimRequest := httptest.NewRequest(http.MethodPost, "/v1/me/daily-drop/claim", nil)
	claimRequest.Header.Set("Authorization", "Bearer player")
	claimRequest.Header.Set("Idempotency-Key", "daily-drop-browser-key")
	claimResponse := httptest.NewRecorder()
	handler.ServeHTTP(claimResponse, claimRequest)
	if claimResponse.Code != http.StatusCreated {
		t.Fatalf("claim status=%d body=%s", claimResponse.Code, claimResponse.Body.String())
	}
	var claimed struct {
		Claim struct {
			Item struct {
				Kind string `json:"kind"`
				ID   string `json:"id"`
			} `json:"item"`
		} `json:"claim"`
	}
	if err := json.Unmarshal(claimResponse.Body.Bytes(), &claimed); err != nil {
		t.Fatal(err)
	}
	if claimed.Claim.Item.ID == "" {
		t.Fatalf("claim omitted item: %s", claimResponse.Body.String())
	}

	unlocksRequest := httptest.NewRequest(http.MethodGet, "/v1/me/unlocks?kind="+claimed.Claim.Item.Kind, nil)
	unlocksRequest.Header.Set("Authorization", "Bearer player")
	unlocksResponse := httptest.NewRecorder()
	handler.ServeHTTP(unlocksResponse, unlocksRequest)
	if unlocksResponse.Code != http.StatusOK || !strings.Contains(unlocksResponse.Body.String(), claimed.Claim.Item.ID) {
		t.Fatalf("unlocks status=%d body=%s", unlocksResponse.Code, unlocksResponse.Body.String())
	}

	viewedRequest := httptest.NewRequest(http.MethodPost, "/v1/me/unlocks/"+claimed.Claim.Item.ID+"/viewed", nil)
	viewedRequest.Header.Set("Authorization", "Bearer player")
	viewedResponse := httptest.NewRecorder()
	handler.ServeHTTP(viewedResponse, viewedRequest)
	if viewedResponse.Code != http.StatusOK || !strings.Contains(viewedResponse.Body.String(), `"viewedAt":`) {
		t.Fatalf("viewed status=%d body=%s", viewedResponse.Code, viewedResponse.Body.String())
	}

	var trainingEntries int
	if err := db.QueryRow(`SELECT COUNT(*) FROM training_entries WHERE player_id = 'player-one'`).Scan(&trainingEntries); err != nil {
		t.Fatal(err)
	}
	if trainingEntries != 0 {
		t.Fatalf("daily drop created %d training entries", trainingEntries)
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
