package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/coder/websocket"
	pb "github.com/dafepro/canvas/server/gen/canvasphysicsv1"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
	"google.golang.org/protobuf/proto"
)

func TestCanonicalTeamLoungeRequiresTodayCheckInAndJoinsCanvasRoom(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "team-lounge-http.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Zoomigo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'America/Chicago', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'Mason', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	repository := store.New(db, time.UTC)
	loungeStore := teamlounge.NewSQLiteStore(db, teamlounge.BeachBoardwalkDevelopmentCatalog())
	handler := httpapi.NewHandler(
		config.Config{AllowedOrigin: "http://example.test"},
		httpapi.WithStore(repository),
		httpapi.WithTeamLoungeStore(loungeStore),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
		httpapi.WithClock(func() time.Time { return now }),
	)

	locked := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge/socket-ticket", nil)
	locked.Header.Set("Authorization", "Bearer test-session")
	lockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(lockedResponse, locked)
	if lockedResponse.Code != http.StatusLocked {
		t.Fatalf("locked status = %d: %s", lockedResponse.Code, lockedResponse.Body.String())
	}

	if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', ?, 8,
		'reps', 2, 2, ?, ?)`, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano),
		now.Add(24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}

	ticketRequest := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge/socket-ticket", nil)
	ticketRequest.Header.Set("Authorization", "Bearer test-session")
	ticketResponse := httptest.NewRecorder()
	handler.ServeHTTP(ticketResponse, ticketRequest)
	if ticketResponse.Code != http.StatusCreated {
		t.Fatalf("ticket status = %d: %s", ticketResponse.Code, ticketResponse.Body.String())
	}
	var credential struct {
		Ticket   string `json:"ticket"`
		RoomID   string `json:"roomId"`
		WeekKey  string `json:"weekKey"`
		DayKey   string `json:"dayKey"`
		Theme    string `json:"theme"`
		Presence int    `json:"recentVisitors"`
		Credits  int    `json:"placementCredits"`
	}
	if err := json.NewDecoder(ticketResponse.Body).Decode(&credential); err != nil {
		t.Fatal(err)
	}
	if len(credential.Ticket) != 43 || credential.RoomID != "team:team-one:lounge:2026-08-24:v9" ||
		credential.WeekKey != "2026-08-24" || credential.DayKey != "2026-08-26" ||
		credential.Theme != "Beach Boardwalk" || credential.Presence != 0 || credential.Credits != 1 {
		t.Fatalf("credential = %#v", credential)
	}

	placementBody := []byte(`{"roomId":"team:team-one:lounge:2026-08-24:v9","definitionId":"zoomigo-stamp-bolt","position":{"x":40,"y":70}}`)
	reservePlacement := func(key string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge/placements", bytes.NewReader(placementBody))
		request.Header.Set("Authorization", "Bearer test-session")
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Idempotency-Key", key)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	firstPlacement := reservePlacement("placement-one")
	if firstPlacement.Code != http.StatusCreated {
		t.Fatalf("placement status = %d: %s", firstPlacement.Code, firstPlacement.Body.String())
	}
	var placement struct {
		ID        string `json:"placementId"`
		Remaining int    `json:"remainingPlacements"`
	}
	if err := json.NewDecoder(firstPlacement.Body).Decode(&placement); err != nil {
		t.Fatal(err)
	}
	if placement.ID == "" || placement.Remaining != 0 {
		t.Fatalf("placement = %#v", placement)
	}
	if replay := reservePlacement("placement-one"); replay.Code != http.StatusOK {
		t.Fatalf("placement replay status = %d: %s", replay.Code, replay.Body.String())
	}
	if exhausted := reservePlacement("placement-two"); exhausted.Code != http.StatusConflict {
		t.Fatalf("placement exhaustion status = %d: %s", exhausted.Code, exhausted.Body.String())
	}

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	socketURL := "ws" + server.URL[4:] + "/v1/realtime/rooms/" + url.PathEscape(credential.RoomID)
	socket, _, err := websocket.Dial(ctx, socketURL, &websocket.DialOptions{
		Subprotocols: []string{"canvas-realtime", "ticket." + credential.Ticket},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })
	join, err := proto.Marshal(&pb.RoomEnvelope{
		RoomId: credential.RoomID,
		Payload: &pb.RoomEnvelope_Join{Join: &pb.Join{
			RoomId: credential.RoomID, ProtocolVersion: 8,
			Definitions: []*pb.DefinitionVersion{
				{DefinitionId: "beach-ball", Version: 5},
				{DefinitionId: "avatar", Version: 1},
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := socket.Write(ctx, websocket.MessageBinary, join); err != nil {
		t.Fatal(err)
	}
	_, raw, err := socket.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	envelope := &pb.RoomEnvelope{}
	if err := proto.Unmarshal(raw, envelope); err != nil {
		t.Fatal(err)
	}
	accepted := envelope.GetJoinAccepted()
	if accepted == nil || accepted.GetUserId() != "player-one" ||
		accepted.GetCanvasId() != teamlounge.BeachBoardwalkCanvasID || accepted.GetTickRate() != 60 {
		t.Fatalf("join accepted = %#v", accepted)
	}

	replayed, replayResponse, replayErr := websocket.Dial(ctx, socketURL, &websocket.DialOptions{
		Subprotocols: []string{"canvas-realtime", "ticket." + credential.Ticket},
	})
	if replayed != nil {
		_ = replayed.CloseNow()
	}
	if replayResponse != nil {
		defer replayResponse.Body.Close()
	}
	if replayErr == nil || replayResponse == nil || replayResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("replayed ticket response = %#v, err = %v", replayResponse, replayErr)
	}
}
