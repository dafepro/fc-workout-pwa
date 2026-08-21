package httpapi_test

import (
	"bufio"
	"context"
	"fmt"
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

	handler := httpapi.NewHandler(config.Config{Environment: "development"},
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

	streamRequest, err := http.NewRequest(http.MethodGet, server.URL+"/v1/teams/team-one/canvas/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	streamRequest.Header.Set("Authorization", "Bearer test-session")
	stream, err := server.Client().Do(streamRequest)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stream.Body.Close() })
	if stream.StatusCode != http.StatusOK || stream.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("stream status/type = %d %q", stream.StatusCode, stream.Header.Get("Content-Type"))
	}
	scanner := bufio.NewScanner(stream.Body)
	if !scanner.Scan() || scanner.Text() != "event: ready" {
		t.Fatalf("first stream line = %q", scanner.Text())
	}
	if !scanner.Scan() || !strings.HasPrefix(scanner.Text(), "data: ") {
		t.Fatalf("ready data line = %q", scanner.Text())
	}
	if !scanner.Scan() || scanner.Text() != "" {
		t.Fatalf("ready terminator = %q", scanner.Text())
	}
	physicsData := scanTeamCanvasHTTPEvent(t, scanner, "physics")
	if !strings.Contains(physicsData, `"sceneId":"top-down-field"`) || !strings.Contains(physicsData, `"playerId":"player-mason"`) {
		t.Fatalf("initial physics data = %s", physicsData)
	}

	avatar := teamCanvasRequest(t, server.Client(), http.MethodPut, server.URL+"/v1/teams/team-one/canvas/avatar", `{"x":120,"y":-8}`)
	if avatar.StatusCode != http.StatusOK {
		t.Fatalf("avatar status = %d", avatar.StatusCode)
	}
	avatarBytes, _ := io.ReadAll(avatar.Body)
	_ = avatar.Body.Close()
	if !strings.Contains(string(avatarBytes), `"x":94`) || !strings.Contains(string(avatarBytes), `"y":6`) {
		t.Fatalf("avatar was not persisted with server bounds: %s", avatarBytes)
	}
	physicsData = scanTeamCanvasHTTPEvent(t, scanner, "physics")
	if !strings.Contains(physicsData, `"position":{"x":94,"y":6}`) {
		t.Fatalf("live avatar physics data = %s", physicsData)
	}

	settings := teamCanvasRequest(t, server.Client(), http.MethodPut, server.URL+"/v1/teams/team-one/canvas/dev-settings", `{"backgroundAssetId":"cosmic-stadium","backgroundColor":"#112233","textColor":"#FFFFFF","textSize":128,"textStyle":"bubble","stampChoices":["spark-cleat","zoomigo-mark","bolt","star","rocket"]}`)
	if settings.StatusCode != http.StatusOK {
		t.Fatalf("settings status = %d", settings.StatusCode)
	}
	_ = settings.Body.Close()

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

}

func scanTeamCanvasHTTPEvent(t *testing.T, scanner *bufio.Scanner, event string) string {
	t.Helper()
	if !scanner.Scan() || scanner.Text() != "event: "+event {
		t.Fatalf("event line = %q, want %q", scanner.Text(), event)
	}
	if !scanner.Scan() || !strings.HasPrefix(scanner.Text(), "data: ") {
		t.Fatalf("event data = %q", scanner.Text())
	}
	data := strings.TrimPrefix(scanner.Text(), "data: ")
	if !scanner.Scan() || scanner.Text() != "" {
		t.Fatalf("event terminator = %q", scanner.Text())
	}
	return data
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
