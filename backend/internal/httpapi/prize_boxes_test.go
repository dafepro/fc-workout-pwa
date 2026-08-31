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

func TestPrizeBoxRoutesKeepSealedClaimsPrivateAndOpenIdempotently(t *testing.T) {
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
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
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

	overview := prizeRequest(handler, http.MethodGet, "/v1/me/prize-boxes", "")
	if overview.Code != http.StatusOK || !strings.Contains(overview.Body.String(), `"dailyState":"available"`) {
		t.Fatalf("overview status=%d body=%s", overview.Code, overview.Body.String())
	}
	missingKey := prizeRequest(handler, http.MethodPost, "/v1/me/prize-boxes/claim-daily", "")
	if missingKey.Code != http.StatusBadRequest {
		t.Fatalf("missing key status=%d body=%s", missingKey.Code, missingKey.Body.String())
	}
	claimed := prizeRequest(handler, http.MethodPost, "/v1/me/prize-boxes/claim-daily", "earn-key")
	if claimed.Code != http.StatusCreated || strings.Contains(claimed.Body.String(), `"item"`) {
		t.Fatalf("sealed claim status=%d body=%s", claimed.Code, claimed.Body.String())
	}
	var claimBody struct {
		Box store.PrizeBox `json:"box"`
	}
	if err = json.Unmarshal(claimed.Body.Bytes(), &claimBody); err != nil || claimBody.Box.ID == "" {
		t.Fatalf("decode sealed claim: %+v, %v", claimBody, err)
	}
	replayed := prizeRequest(handler, http.MethodPost, "/v1/me/prize-boxes/claim-daily", "earn-key")
	if replayed.Code != http.StatusOK || !strings.Contains(replayed.Body.String(), claimBody.Box.ID) {
		t.Fatalf("claim replay status=%d body=%s", replayed.Code, replayed.Body.String())
	}
	opened := prizeRequest(handler, http.MethodPost, "/v1/me/prize-boxes/"+claimBody.Box.ID+"/open", "open-key")
	if opened.Code != http.StatusCreated || !strings.Contains(opened.Body.String(), `"item"`) {
		t.Fatalf("open status=%d body=%s", opened.Code, opened.Body.String())
	}
	var openBody store.OpenPrizeBoxResult
	if err = json.Unmarshal(opened.Body.Bytes(), &openBody); err != nil || openBody.Claim.Item == nil {
		t.Fatalf("decode opened box: %+v, %v", openBody, err)
	}
	openReplay := prizeRequest(handler, http.MethodPost, "/v1/me/prize-boxes/"+claimBody.Box.ID+"/open", "open-key")
	if openReplay.Code != http.StatusOK || openReplay.Body.String() != opened.Body.String() {
		t.Fatalf("open replay status=%d body=%s want=%s", openReplay.Code, openReplay.Body.String(), opened.Body.String())
	}
	inventory := prizeRequest(handler, http.MethodGet, "/v1/me/unlocks?kind="+string(openBody.Claim.Item.Kind), "")
	if inventory.Code != http.StatusOK || !strings.Contains(inventory.Body.String(), openBody.Claim.Item.ID) {
		t.Fatalf("inventory status=%d body=%s", inventory.Code, inventory.Body.String())
	}
	viewed := prizeRequest(handler, http.MethodPost, "/v1/me/unlocks/"+openBody.Claim.Item.ID+"/viewed", "")
	if viewed.Code != http.StatusOK || !strings.Contains(viewed.Body.String(), `"viewedAt"`) {
		t.Fatalf("viewed status=%d body=%s", viewed.Code, viewed.Body.String())
	}
}

func TestDevelopmentCatalogGrantIsAbsentFromProductionHandler(t *testing.T) {
	handler := httpapi.NewHandler(config.Config{})
	response := prizeRequest(handler, http.MethodPost, "/__dev/me/unlocks", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("production catalog grant status=%d body=%s", response.Code, response.Body.String())
	}
}

func prizeRequest(handler http.Handler, method, path, key string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	request.Header.Set("Authorization", "Bearer player")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
