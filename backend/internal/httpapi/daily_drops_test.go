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

	var trainingEntries int
	if err := db.QueryRow(`SELECT COUNT(*) FROM training_entries WHERE player_id = 'player-one'`).Scan(&trainingEntries); err != nil {
		t.Fatal(err)
	}
	if trainingEntries != 0 {
		t.Fatalf("daily drop created %d training entries", trainingEntries)
	}
}
