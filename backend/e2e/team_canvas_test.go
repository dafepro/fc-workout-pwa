//go:build e2e

package e2e_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type canvasSnapshot struct {
	AvailableRewards         int      `json:"availableRewards"`
	DeveloperControlsEnabled bool     `json:"developerControlsEnabled"`
	StampChoices             []string `json:"stampChoices"`
	Pieces                   []struct {
		ID       string  `json:"id"`
		AssetID  string  `json:"assetId"`
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
		Size     float64 `json:"size"`
		Rotation float64 `json:"rotation"`
		Editable bool    `json:"editable"`
	} `json:"pieces"`
}

func TestTeamCanvasPersistsRewardsSettingsAndLiveInvalidations(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	rest := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/rest", masonToken, "", map[string]any{})
	assertStatus(t, rest, http.StatusNoContent)
	_ = rest.Body.Close()

	ticketResponse := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/socket-ticket", masonToken, "", map[string]any{})
	assertStatus(t, ticketResponse, http.StatusCreated)
	var ticket struct {
		Ticket string `json:"ticket"`
	}
	decodeJSON(t, ticketResponse, &ticket)
	origin := "http://pwa.invalid"
	if os.Getenv("E2E_BASE_URL") != "" {
		origin = "http://[::1]:3000"
	}
	socketURL := strings.NewReplacer("https://", "wss://", "http://", "ws://").Replace(api.baseURL) + "/v1/teams/team-hill-striders/canvas/socket"
	socket, dialResponse, err := websocket.Dial(t.Context(), socketURL, &websocket.DialOptions{
		Subprotocols: []string{"zoomigo.team-canvas.v1", "ticket." + ticket.Ticket},
		HTTPHeader:   http.Header{"Origin": []string{origin}},
	})
	if err != nil {
		if dialResponse != nil {
			t.Fatalf("socket dial status = %d: %v", dialResponse.StatusCode, err)
		}
		t.Fatal(err)
	}
	defer socket.CloseNow()
	assertCanvasMessage(t, socket, "room.ready")

	if err := wsjson.Write(t.Context(), socket, map[string]any{
		"v": 1, "type": "avatar.target", "messageId": "move-one",
		"position": map[string]float64{"x": 72, "y": 48},
	}); err != nil {
		t.Fatal(err)
	}
	assertCanvasMessage(t, socket, "avatar.accepted")

	reach := validTrainingEntryPayload(time.Now().UTC())
	reach["assignmentId"] = "assignment-hill-sprints"
	reach["result"] = map[string]any{"kind": "repetitions", "value": 10, "unit": "reps"}
	created := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "canvas-reach", reach)
	assertStatus(t, created, http.StatusCreated)
	var reachEntry struct {
		ID string `json:"id"`
	}
	decodeJSON(t, created, &reachEntry)
	assertCanvasMessage(t, socket, "canvas.changed")

	loaded := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, loaded, http.StatusOK)
	var snapshot canvasSnapshot
	decodeJSON(t, loaded, &snapshot)
	if snapshot.AvailableRewards != 1 || !snapshot.DeveloperControlsEnabled || len(snapshot.StampChoices) != 5 {
		t.Fatalf("unexpected connected snapshot: %+v", snapshot)
	}
	dynamicSettings := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/dev-settings", masonToken, "", map[string]any{
		"backgroundAssetId": "soccer-field", "backgroundColor": "#89C981", "textColor": "#FFFFFF",
		"textSize": 112, "textStyle": "block",
		"stampChoices":        []string{"soccer", "balloon", "rocket", "spark-cleat", "zoomigo-mark"},
		"developerStampLimit": 2,
	})
	assertStatus(t, dynamicSettings, http.StatusOK)
	_ = dynamicSettings.Body.Close()
	assertCanvasMessage(t, socket, "canvas.changed")

	pieceResponse := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": "soccer"})
	assertStatus(t, pieceResponse, http.StatusCreated)
	var piece struct {
		ID      string          `json:"id"`
		Physics json.RawMessage `json:"physics"`
	}
	decodeJSON(t, pieceResponse, &piece)
	if len(piece.Physics) == 0 || string(piece.Physics) == "null" {
		t.Fatalf("dynamic piece has no physics state: %+v", piece)
	}
	assertCanvasMessage(t, socket, "canvas.changed")

	secondPiece := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": "balloon"})
	assertStatus(t, secondPiece, http.StatusCreated)
	var balloonPiece struct {
		ID string `json:"id"`
	}
	decodeJSON(t, secondPiece, &balloonPiece)
	assertCanvasMessage(t, socket, "canvas.changed")
	thirdPiece := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": "rocket"})
	assertStatus(t, thirdPiece, http.StatusCreated)
	var rocketPiece struct {
		ID string `json:"id"`
	}
	decodeJSON(t, thirdPiece, &rocketPiece)
	assertCanvasMessage(t, socket, "canvas.changed")
	overLimit := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": "rocket"})
	assertStatus(t, overLimit, http.StatusUnprocessableEntity)
	_ = overLimit.Body.Close()

	updatedPiece := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/pieces/"+piece.ID, masonToken, "", map[string]any{
		"x": 200, "y": -100, "size": 500, "rotation": 135,
	})
	assertStatus(t, updatedPiece, http.StatusOK)
	_ = updatedPiece.Body.Close()
	assertCanvasMessage(t, socket, "piece.changed")

	settingsResponse := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/dev-settings", masonToken, "", map[string]any{
		"backgroundAssetId":   "creature-quest-town",
		"backgroundColor":     "#DDEEFF",
		"textColor":           "#112233",
		"textSize":            124,
		"textStyle":           "bubble",
		"stampChoices":        []string{"spark-cleat", "zoomigo-mark", "bolt", "star", "rocket"},
		"developerStampLimit": 2,
	})
	assertStatus(t, settingsResponse, http.StatusOK)
	_ = settingsResponse.Body.Close()
	assertCanvasMessage(t, socket, "canvas.changed")

	reloaded := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, reloaded, http.StatusOK)
	body := readBody(reloaded)
	_ = reloaded.Body.Close()
	for _, expected := range []string{`"backgroundAssetId":"creature-quest-town"`, `"x":94`, `"y":6`, `"size":76`, `"rotation":135`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("durable snapshot lacks %s: %s", expected, body)
		}
	}
	for _, private := range []string{"effortLevel", "exhaustionLevel", "resultValue", "ownerPlayerId"} {
		if strings.Contains(body, private) {
			t.Fatalf("team canvas leaked %q: %s", private, body)
		}
	}
	var validJSON any
	if err := json.Unmarshal([]byte(body), &validJSON); err != nil {
		t.Fatalf("durable snapshot JSON: %v", err)
	}

	deletedPiece := api.do(t, http.MethodDelete, "/v1/teams/team-hill-striders/canvas/pieces/"+piece.ID, masonToken, "", nil)
	assertStatus(t, deletedPiece, http.StatusNoContent)
	_ = deletedPiece.Body.Close()
	assertCanvasMessage(t, socket, "canvas.changed")
	afterPieceDelete := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, afterPieceDelete, http.StatusOK)
	var afterPieceDeleteSnapshot canvasSnapshot
	decodeJSON(t, afterPieceDelete, &afterPieceDeleteSnapshot)
	if afterPieceDeleteSnapshot.AvailableRewards != 1 || len(afterPieceDeleteSnapshot.Pieces) != 2 {
		t.Fatalf("deleted piece did not restore reward: %+v", afterPieceDeleteSnapshot)
	}
	replacement := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": "zoomigo-mark"})
	assertStatus(t, replacement, http.StatusCreated)
	var replacementPiece struct {
		ID string `json:"id"`
	}
	decodeJSON(t, replacement, &replacementPiece)
	assertCanvasMessage(t, socket, "canvas.changed")

	deleted := api.do(t, http.MethodDelete, "/v1/training-entries/"+reachEntry.ID, masonToken, "", nil)
	assertStatus(t, deleted, http.StatusNoContent)
	_ = deleted.Body.Close()
	assertCanvasMessage(t, socket, "canvas.changed")
	afterDelete := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, afterDelete, http.StatusOK)
	deletedBody := readBody(afterDelete)
	_ = afterDelete.Body.Close()
	if strings.Contains(deletedBody, `"id":"`+replacementPiece.ID+`"`) ||
		!strings.Contains(deletedBody, `"id":"`+balloonPiece.ID+`"`) ||
		!strings.Contains(deletedBody, `"id":"`+rocketPiece.ID+`"`) {
		t.Fatalf("reward reconciliation removed developer pieces or kept an earned piece: %s", deletedBody)
	}
}

func assertCanvasMessage(t *testing.T, socket *websocket.Conn, expected string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	for {
		var message struct {
			Type string `json:"type"`
			Code string `json:"code"`
		}
		if err := wsjson.Read(ctx, socket, &message); err != nil {
			t.Fatalf("read canvas socket waiting for %q: %v", expected, err)
		}
		if message.Type == expected {
			return
		}
		switch message.Type {
		case "avatar.input", "avatar.accepted", "physics.frame":
			continue
		default:
			t.Fatalf("canvas socket message = %q (%s), want %q", message.Type, message.Code, expected)
		}
	}
}
