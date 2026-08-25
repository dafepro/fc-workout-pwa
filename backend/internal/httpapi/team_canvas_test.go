package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamCanvasRoutesGatePersistAndBroadcast(t *testing.T) {
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "team-canvas-http.db"))
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
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mason', 'club-one', 'Mason', 'C', '{"head":"fox"}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-mason', '2026-01-01')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	handler := httpapi.NewHandler(config.Config{Environment: "development", AllowedOrigin: "http://[::1]:3000"},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
		}}),
	)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	locked := teamCanvasRequest(t, server.Client(), http.MethodGet, server.URL+"/v1/teams/team-one/canvas", "")
	if locked.StatusCode != http.StatusLocked {
		t.Fatalf("locked status = %d, want 423", locked.StatusCode)
	}
	_ = locked.Body.Close()

	rest := teamCanvasRequest(t, server.Client(), http.MethodPost, server.URL+"/v1/teams/team-one/canvas/rest", "{}")
	if rest.StatusCode != http.StatusNoContent {
		t.Fatalf("rest status = %d", rest.StatusCode)
	}
	_ = rest.Body.Close()

	ticketResponse := teamCanvasRequest(t, server.Client(), http.MethodPost, server.URL+"/v1/teams/team-one/canvas/socket-ticket", "{}")
	if ticketResponse.StatusCode != http.StatusCreated {
		t.Fatalf("socket ticket status = %d", ticketResponse.StatusCode)
	}
	var ticket struct {
		Ticket string `json:"ticket"`
	}
	if err := json.NewDecoder(ticketResponse.Body).Decode(&ticket); err != nil {
		t.Fatal(err)
	}
	_ = ticketResponse.Body.Close()
	socketURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/v1/teams/team-one/canvas/socket"
	socket, dialResponse, err := websocket.Dial(ctx, socketURL, &websocket.DialOptions{
		Subprotocols: []string{"zoomigo.team-canvas.v1", "ticket." + ticket.Ticket},
		HTTPHeader:   http.Header{"Origin": []string{"http://[::1]:3000"}},
	})
	if err != nil {
		if dialResponse != nil {
			t.Fatalf("socket dial status = %d: %v", dialResponse.StatusCode, err)
		}
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })
	var socketMessage struct {
		Version   int             `json:"v"`
		Type      string          `json:"type"`
		Frame     json.RawMessage `json:"frame"`
		Code      string          `json:"code"`
		HostEpoch uint64          `json:"hostEpoch"`
	}
	if err := wsjson.Read(ctx, socket, &socketMessage); err != nil {
		t.Fatal(err)
	}
	if socketMessage.Version != 1 || socketMessage.Type != "room.ready" || socketMessage.HostEpoch != 1 || !strings.Contains(string(socketMessage.Frame), `"playerId":"player-mason"`) {
		t.Fatalf("socket ready = %#v", socketMessage)
	}
	if err := wsjson.Write(ctx, socket, map[string]any{
		"v": 1, "type": "avatar.target", "messageId": "tampered-move",
		"position": map[string]float64{"x": 900, "y": 48},
	}); err != nil {
		t.Fatal(err)
	}
	if err := wsjson.Read(ctx, socket, &socketMessage); err != nil {
		t.Fatal(err)
	}
	if socketMessage.Type != "error" || socketMessage.Code != "invalid_message" {
		t.Fatalf("tampered socket update = %#v", socketMessage)
	}
	if err := wsjson.Write(ctx, socket, map[string]any{
		"v": 1, "type": "avatar.target", "messageId": "move-one",
		"position": map[string]float64{"x": 72, "y": 48},
	}); err != nil {
		t.Fatal(err)
	}
	for socketMessage.Type != "avatar.accepted" {
		if err := wsjson.Read(ctx, socket, &socketMessage); err != nil {
			t.Fatal(err)
		}
	}
	if !strings.Contains(string(socketMessage.Frame), `"x":72`) {
		t.Fatalf("socket avatar acceptance = %#v", socketMessage)
	}

	snapshot := teamCanvasRequest(t, server.Client(), http.MethodGet, server.URL+"/v1/teams/team-one/canvas", "")
	if snapshot.StatusCode != http.StatusOK {
		t.Fatalf("snapshot status = %d", snapshot.StatusCode)
	}
	snapshotBytes, _ := io.ReadAll(snapshot.Body)
	_ = snapshot.Body.Close()
	if !strings.Contains(string(snapshotBytes), `"developerControlsEnabled":true`) ||
		!strings.Contains(string(snapshotBytes), `"avatarConfiguration":{"head":"fox"}`) ||
		!strings.Contains(string(snapshotBytes), `"physics":{"v":1`) {
		t.Fatalf("snapshot did not contain connected canvas fields: %s", snapshotBytes)
	}

	for _, legacyPath := range []string{"events", "avatar"} {
		legacy := teamCanvasRequest(t, server.Client(), http.MethodGet, server.URL+"/v1/teams/team-one/canvas/"+legacyPath, "")
		if legacy.StatusCode != http.StatusNotFound {
			t.Fatalf("legacy canvas %s status = %d, want 404", legacyPath, legacy.StatusCode)
		}
		_ = legacy.Body.Close()
	}

	settings := teamCanvasRequest(t, server.Client(), http.MethodPut, server.URL+"/v1/teams/team-one/canvas/dev-settings", `{"backgroundAssetId":"cosmic-stadium","backgroundColor":"#112233","textColor":"#FFFFFF","textSize":128,"textStyle":"bubble","stampChoices":["spark-cleat","zoomigo-mark","bolt","star","rocket"],"developerStampLimit":3}`)
	if settings.StatusCode != http.StatusOK {
		t.Fatalf("settings status = %d", settings.StatusCode)
	}
	_ = settings.Body.Close()

	withDeveloperStamps := teamCanvasRequest(t, server.Client(), http.MethodGet, server.URL+"/v1/teams/team-one/canvas", "")
	developerSnapshot, _ := io.ReadAll(withDeveloperStamps.Body)
	_ = withDeveloperStamps.Body.Close()
	if withDeveloperStamps.StatusCode != http.StatusOK ||
		!strings.Contains(string(developerSnapshot), `"availableRewards":3`) ||
		!strings.Contains(string(developerSnapshot), `"developerStampLimit":3`) {
		t.Fatalf("developer stamp projection = %d %s", withDeveloperStamps.StatusCode, developerSnapshot)
	}
	for index := 0; index < 3; index++ {
		piece := teamCanvasRequest(t, server.Client(), http.MethodPost, server.URL+"/v1/teams/team-one/canvas/pieces", `{"assetId":"rocket"}`)
		if piece.StatusCode != http.StatusCreated {
			t.Fatalf("developer piece %d status = %d", index+1, piece.StatusCode)
		}
		_ = piece.Body.Close()
	}
	overLimit := teamCanvasRequest(t, server.Client(), http.MethodPost, server.URL+"/v1/teams/team-one/canvas/pieces", `{"assetId":"rocket"}`)
	if overLimit.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("developer piece above limit status = %d, want 422", overLimit.StatusCode)
	}
	_ = overLimit.Body.Close()

	production := httpapi.NewHandler(config.Config{Environment: "production"},
		httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
		}}),
	)
	request := httptest.NewRequest(http.MethodPut, "/v1/teams/team-one/canvas/dev-settings", strings.NewReader(`{"backgroundAssetId":"grass-gradient"}`))
	request.Header.Set("Authorization", "Bearer test-session")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	production.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("production dev settings status = %d, want 404", response.Code)
	}
	productionSnapshot := httptest.NewRecorder()
	productionRequest := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/canvas", nil)
	productionRequest.Header.Set("Authorization", "Bearer test-session")
	production.ServeHTTP(productionSnapshot, productionRequest)
	if productionSnapshot.Code != http.StatusOK || strings.Contains(productionSnapshot.Body.String(), `"availableRewards":3`) {
		t.Fatalf("production honored developer stamps: %d %s", productionSnapshot.Code, productionSnapshot.Body.String())
	}

}

func teamCanvasRequest(t *testing.T, client *http.Client, method, url, body string) *http.Response {
	t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	request, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer test-session")
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(fmt.Errorf("%s %s: %w", method, url, err))
	}
	return response
}
