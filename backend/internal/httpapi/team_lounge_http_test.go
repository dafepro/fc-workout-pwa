package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	pb "github.com/dafepro/canvas/server/gen/canvasphysicsv1"
	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
	"google.golang.org/protobuf/proto"
)

func TestTeamLoungeV2TicketBindsTheAuthenticatedPlayersExactWeek(t *testing.T) {
	ctx := context.Background()
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
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-two', 'club-one', 'Maya', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('former-three', 'club-one', 'Former', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('former-four', 'club-one', 'Former', 'B', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('former-five', 'club-one', 'Former', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-two', '2026-01-01')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	repository := store.New(db, time.UTC)
	loungeStore := teamlounge.NewSQLiteStore(db, teamlounge.BeachBoardwalkCatalog())
	handler := httpapi.NewHandler(
		config.Config{Environment: "development", AllowedOrigin: "http://example.test"},
		httpapi.WithStore(repository),
		httpapi.WithTeamLoungeStore(loungeStore),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)

	rest := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/canvas/rest", strings.NewReader("{}"))
	rest.Header.Set("Authorization", "Bearer test-session")
	restRecorder := httptest.NewRecorder()
	handler.ServeHTTP(restRecorder, rest)
	if restRecorder.Code != http.StatusNoContent {
		t.Fatalf("rest status = %d: %s", restRecorder.Code, restRecorder.Body.String())
	}
	visitorAt := time.Now().UTC().Add(-time.Hour)
	if _, err := db.ExecContext(ctx, `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES ('entry-player-two', 'player-two', 'team-one', 'hill-sprints', ?, 8,
		'reps', 2, 2, ?, ?)`, visitorAt.Format(time.RFC3339Nano),
		visitorAt.Format(time.RFC3339Nano), visitorAt.Add(24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	projection, err := repository.TeamCanvas(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
	}, "team-one", time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	seedRoomID, err := teamlounge.WeeklyRoomID("team-one", projection.WeekKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := loungeStore.BindRoom(ctx, seedRoomID, "team-one", projection.WeekKey, roomsdk.RoomTemplate{
		CanvasID: teamlounge.BeachBoardwalkCanvasID, CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion,
	}); err != nil {
		t.Fatal(err)
	}
	if err := loungeStore.RecordVisit(ctx, seedRoomID, "player-two", visitorAt); err != nil {
		t.Fatal(err)
	}
	for index, playerID := range []string{"former-three", "former-four", "former-five"} {
		if err := loungeStore.RecordVisit(ctx, seedRoomID, playerID, visitorAt.Add(time.Duration(index+1)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge-v2/socket-ticket", nil)
	request.Header.Set("Authorization", "Bearer test-session")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("ticket status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Ticket     string   `json:"ticket"`
		RoomID     string   `json:"roomId"`
		VisitorIDs []string `json:"visitorIds"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	teamID, weekKey, parseErr := teamlounge.ParseWeeklyRoomID(response.RoomID)
	if len(response.Ticket) != 43 || parseErr != nil || teamID != "team-one" || weekKey == "" {
		t.Fatalf("ticket response = %#v", response)
	}
	if len(response.VisitorIDs) != 1 || response.VisitorIDs[0] != "player-two" {
		t.Fatalf("safe visitor projection = %#v", response.VisitorIDs)
	}
	template, err := loungeStore.ResolveRoomTemplate(ctx, response.RoomID)
	if err != nil || template.CanvasID != teamlounge.BeachBoardwalkCanvasID || template.CanvasVersion != teamlounge.BeachBoardwalkCanvasVersion {
		t.Fatalf("bound template = %#v, %v", template, err)
	}

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	socketURL := "ws" + server.URL[4:] + "/v1/realtime/rooms/" + url.PathEscape(response.RoomID)
	socket, _, err := websocket.Dial(ctx, socketURL, &websocket.DialOptions{
		Subprotocols: []string{"canvas-realtime", "ticket." + response.Ticket},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })
	join, err := proto.Marshal(&pb.RoomEnvelope{
		RoomId: response.RoomID,
		Payload: &pb.RoomEnvelope_Join{Join: &pb.Join{
			RoomId: response.RoomID, ProtocolVersion: 8,
			Definitions: []*pb.DefinitionVersion{
				{DefinitionId: "beach-ball", Version: 1},
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
	messageType, raw, err := socket.Read(ctx)
	if err != nil || messageType != websocket.MessageBinary {
		t.Fatalf("join response = %v, %v", messageType, err)
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
	traces, err := loungeStore.ListVisitTraces(ctx, response.RoomID, "player-two", 20)
	foundSocketVisit := false
	for _, trace := range traces {
		foundSocketVisit = foundSocketVisit || trace.PlayerID == "player-one"
	}
	if err != nil || !foundSocketVisit {
		t.Fatalf("accepted socket visit = %#v, %v", traces, err)
	}

	placement := &pb.DurableCommand{
		CommandId:         "place-weekly-stamp",
		Kind:              pb.DurableCommandKind_DURABLE_SPAWN_ITEM,
		DefinitionId:      teamlounge.StampDefinitionID("star"),
		DefinitionVersion: 1,
		Position:          &pb.Vec2{X: 45, Y: 60},
		Scale:             1,
		ConfigJson:        []byte("{}"),
	}
	sendLoungeDurableCommand(t, ctx, socket, response.RoomID, placement)
	placed := awaitLoungeDurableResult(t, ctx, socket, placement.CommandId)
	if !placed.Accepted {
		t.Fatalf("included stamp placement rejected: %s", placed.RejectReason)
	}
	if err := socket.Close(websocket.StatusNormalClosure, "reconnect test"); err != nil {
		t.Fatal(err)
	}

	reconnectTicketRequest := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge-v2/socket-ticket", nil)
	reconnectTicketRequest.Header.Set("Authorization", "Bearer test-session")
	reconnectTicketRecorder := httptest.NewRecorder()
	handler.ServeHTTP(reconnectTicketRecorder, reconnectTicketRequest)
	if reconnectTicketRecorder.Code != http.StatusCreated {
		t.Fatalf("reconnect ticket status = %d: %s", reconnectTicketRecorder.Code, reconnectTicketRecorder.Body.String())
	}
	var reconnectTicket struct {
		Ticket string `json:"ticket"`
		RoomID string `json:"roomId"`
	}
	if err := json.NewDecoder(reconnectTicketRecorder.Body).Decode(&reconnectTicket); err != nil {
		t.Fatal(err)
	}
	reconnected, _, err := websocket.Dial(ctx, socketURL, &websocket.DialOptions{
		Subprotocols: []string{"canvas-realtime", "ticket." + reconnectTicket.Ticket},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reconnected.CloseNow() })
	rejoin := &pb.RoomEnvelope{
		RoomId: reconnectTicket.RoomID,
		Payload: &pb.RoomEnvelope_Join{Join: &pb.Join{
			RoomId: reconnectTicket.RoomID, ProtocolVersion: 8,
			Definitions: []*pb.DefinitionVersion{
				{DefinitionId: "beach-ball", Version: 1},
				{DefinitionId: "avatar", Version: 1},
			},
		}},
	}
	if err := reconnected.Write(ctx, websocket.MessageBinary, mustMarshalLoungeEnvelope(t, rejoin)); err != nil {
		t.Fatal(err)
	}
	if joined := awaitLoungeEnvelope(t, ctx, reconnected, func(candidate *pb.RoomEnvelope) bool {
		return candidate.GetJoinAccepted() != nil
	}); joined.GetJoinAccepted().GetUserId() != "player-one" {
		t.Fatalf("reconnected join = %#v", joined.GetJoinAccepted())
	}

	duplicate := proto.Clone(placement).(*pb.DurableCommand)
	duplicate.CommandId = "place-second-weekly-stamp"
	duplicate.Position = &pb.Vec2{X: 37, Y: 41}
	sendLoungeDurableCommand(t, ctx, reconnected, response.RoomID, duplicate)
	second := awaitLoungeDurableResult(t, ctx, reconnected, duplicate.CommandId)
	if second.Accepted || second.RejectReason != teamlounge.StampAlreadyPlacedReason {
		t.Fatalf("second placement = accepted %v reason %q", second.Accepted, second.RejectReason)
	}
}

func mustMarshalLoungeEnvelope(t *testing.T, envelope *pb.RoomEnvelope) []byte {
	t.Helper()
	raw, err := proto.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func awaitLoungeEnvelope(
	t *testing.T,
	ctx context.Context,
	socket *websocket.Conn,
	accept func(*pb.RoomEnvelope) bool,
) *pb.RoomEnvelope {
	t.Helper()
	deadline, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	for {
		messageType, raw, err := socket.Read(deadline)
		if err != nil {
			t.Fatal(err)
		}
		if messageType != websocket.MessageBinary {
			continue
		}
		envelope := &pb.RoomEnvelope{}
		if err := proto.Unmarshal(raw, envelope); err != nil {
			t.Fatal(err)
		}
		if accept(envelope) {
			return envelope
		}
	}
}

func sendLoungeDurableCommand(
	t *testing.T,
	ctx context.Context,
	socket *websocket.Conn,
	roomID string,
	command *pb.DurableCommand,
) {
	t.Helper()
	raw, err := proto.Marshal(&pb.RoomEnvelope{
		RoomId:  roomID,
		Payload: &pb.RoomEnvelope_DurableCommand{DurableCommand: command},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := socket.Write(ctx, websocket.MessageBinary, raw); err != nil {
		t.Fatal(err)
	}
}

func awaitLoungeDurableResult(
	t *testing.T,
	ctx context.Context,
	socket *websocket.Conn,
	commandID string,
) *pb.DurableCommandResult {
	t.Helper()
	deadline, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	for {
		messageType, raw, err := socket.Read(deadline)
		if err != nil {
			t.Fatalf("await durable result %q: %v", commandID, err)
		}
		if messageType != websocket.MessageBinary {
			continue
		}
		envelope := &pb.RoomEnvelope{}
		if err := proto.Unmarshal(raw, envelope); err != nil {
			t.Fatal(err)
		}
		if result := envelope.GetDurableResult(); result != nil && result.CommandId == commandID {
			return result
		}
	}
}
