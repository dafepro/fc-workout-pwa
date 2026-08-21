//go:build e2e

package e2e_test

import (
	"bufio"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
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

	stream := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas/events", masonToken, "", nil)
	assertStatus(t, stream, http.StatusOK)
	defer stream.Body.Close()
	if stream.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("event stream content type = %q", stream.Header.Get("Content-Type"))
	}
	scanner := bufio.NewScanner(stream.Body)
	assertCanvasEvent(t, scanner, "ready")

	avatar := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/avatar", masonToken, "", map[string]any{"x": 120, "y": -8})
	assertStatus(t, avatar, http.StatusOK)
	_ = avatar.Body.Close()
	assertCanvasEvent(t, scanner, "canvas")

	reach := validTrainingEntryPayload(time.Now().UTC())
	reach["assignmentId"] = "assignment-hill-sprints"
	reach["result"] = map[string]any{"kind": "repetitions", "value": 10, "unit": "reps"}
	created := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "canvas-reach", reach)
	assertStatus(t, created, http.StatusCreated)
	var reachEntry struct {
		ID string `json:"id"`
	}
	decodeJSON(t, created, &reachEntry)
	assertCanvasEvent(t, scanner, "canvas")

	loaded := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, loaded, http.StatusOK)
	var snapshot canvasSnapshot
	decodeJSON(t, loaded, &snapshot)
	if snapshot.AvailableRewards != 1 || !snapshot.DeveloperControlsEnabled || len(snapshot.StampChoices) != 5 {
		t.Fatalf("unexpected connected snapshot: %+v", snapshot)
	}

	pieceResponse := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": snapshot.StampChoices[0]})
	assertStatus(t, pieceResponse, http.StatusCreated)
	var piece struct {
		ID string `json:"id"`
	}
	decodeJSON(t, pieceResponse, &piece)
	assertCanvasEvent(t, scanner, "canvas")

	secondPiece := api.do(t, http.MethodPost, "/v1/teams/team-hill-striders/canvas/pieces", masonToken, "", map[string]any{"assetId": snapshot.StampChoices[1]})
	assertStatus(t, secondPiece, http.StatusUnprocessableEntity)
	_ = secondPiece.Body.Close()

	updatedPiece := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/pieces/"+piece.ID, masonToken, "", map[string]any{
		"x": 200, "y": -100, "size": 500, "rotation": 90,
	})
	assertStatus(t, updatedPiece, http.StatusOK)
	_ = updatedPiece.Body.Close()
	assertCanvasEvent(t, scanner, "canvas")

	settingsResponse := api.do(t, http.MethodPut, "/v1/teams/team-hill-striders/canvas/dev-settings", masonToken, "", map[string]any{
		"backgroundAssetId": "creature-quest-town",
		"backgroundColor":   "#DDEEFF",
		"textColor":         "#112233",
		"textSize":          124,
		"textStyle":         "bubble",
		"stampChoices":      []string{"spark-cleat", "zoomigo-mark", "bolt", "star", "rocket"},
	})
	assertStatus(t, settingsResponse, http.StatusOK)
	_ = settingsResponse.Body.Close()
	assertCanvasEvent(t, scanner, "canvas")

	reloaded := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, reloaded, http.StatusOK)
	body := readBody(reloaded)
	_ = reloaded.Body.Close()
	for _, expected := range []string{`"backgroundAssetId":"creature-quest-town"`, `"x":94`, `"y":6`, `"size":76`, `"rotation":45`} {
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

	deleted := api.do(t, http.MethodDelete, "/v1/training-entries/"+reachEntry.ID, masonToken, "", nil)
	assertStatus(t, deleted, http.StatusNoContent)
	_ = deleted.Body.Close()
	assertCanvasEvent(t, scanner, "canvas")
	afterDelete := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/canvas", masonToken, "", nil)
	assertStatus(t, afterDelete, http.StatusOK)
	deletedBody := readBody(afterDelete)
	_ = afterDelete.Body.Close()
	if !strings.Contains(deletedBody, `"pieces":[]`) {
		t.Fatalf("deleted reward source left a canvas piece: %s", deletedBody)
	}
}

func assertCanvasEvent(t *testing.T, scanner *bufio.Scanner, expected string) {
	t.Helper()
	if !scanner.Scan() || scanner.Text() != "event: "+expected {
		t.Fatalf("event line = %q, want %q", scanner.Text(), expected)
	}
	if !scanner.Scan() || !strings.HasPrefix(scanner.Text(), "data: ") {
		t.Fatalf("event data = %q", scanner.Text())
	}
	if !scanner.Scan() || scanner.Text() != "" {
		t.Fatalf("event terminator = %q", scanner.Text())
	}
}
