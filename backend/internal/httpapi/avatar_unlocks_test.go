package httpapi_test

import (
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

func TestAvatarSaveRejectsKnownUnownedPartsAndPreservesUnknownLegacyValues(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "avatar-unlocks.db")))
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
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}}),
	)

	locked := httptest.NewRequest(http.MethodPut, "/v1/me/avatar", strings.NewReader(`{"configuration":{"head":"dog"}}`))
	locked.Header.Set("Authorization", "Bearer player")
	lockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(lockedResponse, locked)
	if lockedResponse.Code != http.StatusForbidden || !strings.Contains(lockedResponse.Body.String(), `"code":"locked_avatar_part"`) {
		t.Fatalf("locked status=%d body=%s", lockedResponse.Code, lockedResponse.Body.String())
	}

	if _, err := db.Exec(`INSERT INTO player_unlocks
		(player_id, item_kind, item_id, source, unlocked_at)
		VALUES ('player-one', 'avatar_part', 'avatar-head-dog', 'daily_drop', '2026-08-24T14:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{
		"owned":  `{"configuration":{"head":"dog"}}`,
		"legacy": `{"configuration":{"head":"falcon"}}`,
	} {
		request := httptest.NewRequest(http.MethodPut, "/v1/me/avatar", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer player")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", name, response.Code, response.Body.String())
		}
	}
}
