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
	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
	"google.golang.org/protobuf/proto"
)

func TestTeamLoungeIssuesOwnerBoundItemMutationPermit(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "team-lounge-mutation-http.db"))
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
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 2, 2, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	loungeStore := teamlounge.NewSQLiteStore(db, teamlounge.BeachBoardwalkLoungeCatalog())
	loungeStore.SetClock(func() time.Time { return now })
	roomID := "team:team-one:lounge:v14"
	if _, err := loungeStore.BindRoom(ctx, roomID, "team-one", "2026-08-24",
		roomsdk.RoomTemplate{CanvasID: teamlounge.BeachBoardwalkCanvasID,
			CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion}); err != nil {
		t.Fatal(err)
	}
	reservation, err := loungeStore.ReservePlacement(ctx, roomID, "player-one", "place-editable",
		teamlounge.PlacementRequest{DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 2, X: 20, Y: 70}, now)
	if err != nil {
		t.Fatal(err)
	}
	item := roomsdk.SnapshotItem{EntityID: "canvas-item-editable", DefinitionID: reservation.DefinitionID,
		DefinitionVersion: reservation.DefinitionVersion, OwnerUserID: "player-one", ItemRevision: 2,
		Transform: roomsdk.Transform{X: reservation.X, Y: reservation.Y, Scale: 1}, ResolvedConfig: json.RawMessage(`{}`)}
	decision, err := loungeStore.AuthorizeMutation(ctx, roomsdk.MutationAuthorizationRequest{
		Participant: roomsdk.Identity{UserID: "player-one"}, RoomID: roomID,
		CanvasID: teamlounge.BeachBoardwalkCanvasID, CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion,
		Kind: roomsdk.MutationKindSpawn, DefinitionID: reservation.DefinitionID,
		DefinitionVersion: reservation.DefinitionVersion,
		ProposedItem: &roomsdk.SnapshotItem{DefinitionID: reservation.DefinitionID,
			DefinitionVersion: reservation.DefinitionVersion, OwnerUserID: "player-one",
			Transform: roomsdk.Transform{X: reservation.X, Y: reservation.Y, Scale: 1}, ResolvedConfig: json.RawMessage(`{}`)},
		Idempotency:           roomsdk.MutationIdempotencyIdentity{Key: "spawn-editable"},
		AuthorizationEvidence: []byte(reservation.Permit), ApplicationCorrelationID: reservation.ID,
	})
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize seed placement = %+v, %v", decision, err)
	}
	if err := loungeStore.NotifyMutationOutcome(ctx, roomsdk.MutationOutcome{Status: roomsdk.MutationOutcomeAccepted,
		CorrelationID: reservation.ID, RoomID: roomID, ParticipantID: "player-one",
		Kind: roomsdk.MutationKindSpawn, EntityID: item.EntityID, DefinitionID: item.DefinitionID,
		DefinitionVersion: item.DefinitionVersion, ItemRevision: 1}); err != nil {
		t.Fatal(err)
	}
	rawSnapshot, err := json.Marshal(roomsdk.CanvasSnapshot{SchemaVersion: 1,
		CanvasID: teamlounge.BeachBoardwalkCanvasID, CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion,
		SceneRevision: 2, CapturedAt: now.Format(time.RFC3339Nano), Normalized: true,
		Items: []roomsdk.SnapshotItem{item}, Avatars: []roomsdk.SnapshotAvatar{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := loungeStore.SaveSnapshot(ctx, roomsdk.SnapshotRecord{RoomID: roomID,
		CanvasID: teamlounge.BeachBoardwalkCanvasID, CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion,
		SceneRevision: 2, CapturedAt: now, Normalized: true, SnapshotRaw: rawSnapshot}); err != nil {
		t.Fatal(err)
	}

	handler := httpapi.NewHandler(config.Config{AllowedOrigin: "http://example.test"},
		httpapi.WithStore(store.New(db, time.UTC)), httpapi.WithTeamLoungeStore(loungeStore),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}}),
		httpapi.WithClock(func() time.Time { return now }))
	ticketRequest := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/lounge/socket-ticket", nil)
	ticketRequest.Header.Set("Authorization", "Bearer test-session")
	ticketResponse := httptest.NewRecorder()
	handler.ServeHTTP(ticketResponse, ticketRequest)
	if ticketResponse.Code != http.StatusCreated {
		t.Fatalf("editable item ticket status = %d: %s", ticketResponse.Code, ticketResponse.Body.String())
	}
	var ticket struct {
		EditableItemIDs []string `json:"editableItemIds"`
	}
	if err := json.NewDecoder(ticketResponse.Body).Decode(&ticket); err != nil {
		t.Fatal(err)
	}
	if len(ticket.EditableItemIDs) != 1 || ticket.EditableItemIDs[0] != item.EntityID {
		t.Fatalf("editable item ticket = %#v", ticket)
	}
	body := []byte(`{"roomId":"team:team-one:lounge:v14","itemRevision":2,"kind":"rotation","transform":{"rotation":0.5}}`)
	request := httptest.NewRequest(http.MethodPost,
		"/v1/teams/team-one/lounge/items/canvas-item-editable/mutation-permits", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer test-session")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "rotate-editable")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("mutation permit status = %d: %s", response.Code, response.Body.String())
	}
	var permit struct {
		ID           string `json:"mutationPermitId"`
		Permit       string `json:"permit"`
		EntityID     string `json:"entityId"`
		ItemRevision uint64 `json:"itemRevision"`
		Kind         string `json:"kind"`
		Current      struct {
			X        float64 `json:"x"`
			Y        float64 `json:"y"`
			Rotation float64 `json:"rotation"`
			Scale    float64 `json:"scale"`
		} `json:"currentTransform"`
		Transform struct {
			X        float64 `json:"x"`
			Y        float64 `json:"y"`
			Rotation float64 `json:"rotation"`
			Scale    float64 `json:"scale"`
		} `json:"transform"`
	}
	if err := json.NewDecoder(response.Body).Decode(&permit); err != nil {
		t.Fatal(err)
	}
	if permit.ID == "" || len(permit.Permit) != 43 || permit.EntityID != item.EntityID ||
		permit.ItemRevision != item.ItemRevision || permit.Kind != "rotation" ||
		permit.Current.X != item.Transform.X || permit.Current.Y != item.Transform.Y ||
		permit.Transform.Rotation != 0.5 || permit.Transform.X != item.Transform.X {
		t.Fatalf("mutation permit = %#v", permit)
	}

	staleRequest := httptest.NewRequest(http.MethodPost,
		"/v1/teams/team-one/lounge/items/canvas-item-editable/mutation-permits",
		bytes.NewReader([]byte(`{"roomId":"team:team-one:lounge:v14","itemRevision":1,"kind":"scale","transform":{"scale":1.2}}`)))
	staleRequest.Header.Set("Authorization", "Bearer test-session")
	staleRequest.Header.Set("Content-Type", "application/json")
	staleRequest.Header.Set("Idempotency-Key", "stale-editable")
	staleResponse := httptest.NewRecorder()
	handler.ServeHTTP(staleResponse, staleRequest)
	if staleResponse.Code != http.StatusConflict {
		t.Fatalf("stale mutation status = %d: %s", staleResponse.Code, staleResponse.Body.String())
	}
	var stale struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
		EntityID     string                 `json:"entityId"`
		ItemRevision uint64                 `json:"itemRevision"`
		Transform    map[string]json.Number `json:"transform"`
	}
	decoder := json.NewDecoder(staleResponse.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&stale); err != nil {
		t.Fatal(err)
	}
	if stale.Error.Code != "item_revision_stale" || stale.EntityID != item.EntityID ||
		stale.ItemRevision != item.ItemRevision || stale.Transform["x"].String() != "20" {
		t.Fatalf("stale mutation response = %#v", stale)
	}
}

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
	loungeStore := teamlounge.NewSQLiteStore(db, teamlounge.BeachBoardwalkLoungeCatalog())
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
		Ticket   string   `json:"ticket"`
		RoomID   string   `json:"roomId"`
		WeekKey  string   `json:"weekKey"`
		DayKey   string   `json:"dayKey"`
		Theme    string   `json:"theme"`
		Presence int      `json:"recentVisitors"`
		Credits  int      `json:"placementCredits"`
		Capacity int      `json:"placementCapacity"`
		Editable []string `json:"editableItemIds"`
	}
	if err := json.NewDecoder(ticketResponse.Body).Decode(&credential); err != nil {
		t.Fatal(err)
	}
	if len(credential.Ticket) != 43 || credential.RoomID != "team:team-one:lounge:v14" ||
		credential.WeekKey != "2026-08-24" || credential.DayKey != "2026-08-26" ||
		credential.Theme != "Beach Boardwalk" || credential.Presence != 0 || credential.Credits != 1 || credential.Capacity != 1 ||
		credential.Editable == nil {
		t.Fatalf("credential = %#v", credential)
	}

	placementBody := []byte(`{"roomId":"team:team-one:lounge:v14","definitionId":"zoomigo-stamp-bolt","definitionVersion":2,"position":{"x":40,"y":70}}`)
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
		ID                string `json:"placementId"`
		Permit            string `json:"permit"`
		DefinitionVersion uint32 `json:"definitionVersion"`
		Remaining         int    `json:"remainingPlacements"`
	}
	if err := json.NewDecoder(firstPlacement.Body).Decode(&placement); err != nil {
		t.Fatal(err)
	}
	if placement.ID == "" || len(placement.Permit) != 43 || placement.DefinitionVersion != 2 || placement.Remaining != 0 {
		t.Fatalf("placement = %#v", placement)
	}
	if replay := reservePlacement("placement-one"); replay.Code != http.StatusOK {
		t.Fatalf("placement replay status = %d: %s", replay.Code, replay.Body.String())
	}
	recoverRequest := httptest.NewRequest(http.MethodDelete,
		"/v1/teams/team-one/lounge/placements/pending", bytes.NewReader([]byte(`{"roomId":"team:team-one:lounge:v14"}`)))
	recoverRequest.Header.Set("Authorization", "Bearer test-session")
	recoverRequest.Header.Set("Content-Type", "application/json")
	recoverRequest.Header.Set("Idempotency-Key", "placement-one")
	recoverResponse := httptest.NewRecorder()
	handler.ServeHTTP(recoverResponse, recoverRequest)
	if recoverResponse.Code != http.StatusOK {
		t.Fatalf("placement recovery status = %d: %s", recoverResponse.Code, recoverResponse.Body.String())
	}
	var recovery struct {
		Released  bool `json:"released"`
		Remaining int  `json:"remainingPlacements"`
	}
	if err := json.NewDecoder(recoverResponse.Body).Decode(&recovery); err != nil {
		t.Fatal(err)
	}
	if !recovery.Released || recovery.Remaining != 1 {
		t.Fatalf("placement recovery = %#v", recovery)
	}
	if second := reservePlacement("placement-two"); second.Code != http.StatusCreated {
		t.Fatalf("placement after recovery status = %d: %s", second.Code, second.Body.String())
	}
	if exhausted := reservePlacement("placement-three"); exhausted.Code != http.StatusConflict {
		t.Fatalf("placement exhaustion status = %d: %s", exhausted.Code, exhausted.Body.String())
	}
	legacyCommit := httptest.NewRequest(http.MethodPost,
		"/v1/teams/team-one/lounge/placements/"+placement.ID+"/commit", bytes.NewReader([]byte(`{}`)))
	legacyCommit.Header.Set("Authorization", "Bearer test-session")
	legacyCommitResponse := httptest.NewRecorder()
	handler.ServeHTTP(legacyCommitResponse, legacyCommit)
	if legacyCommitResponse.Code != http.StatusNotFound {
		t.Fatalf("legacy browser commit status = %d", legacyCommitResponse.Code)
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
				{DefinitionId: "beach-ball", Version: 7},
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
