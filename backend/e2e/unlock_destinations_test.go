//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestE2EUnlockGrantCreatesExactDailyRewardsOnlyInFixtureMode(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	body, err := json.Marshal(map[string]any{
		"playerId": "player-mason",
		"itemIds":  []string{"avatar-head-dog", "canvas-stamp-lion", "canvas-prop-beach-ball"},
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, api.baseURL+"/__e2e/unlocks", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-E2E-Reset-Key", api.resetKey)
	granted, err := api.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	assertStatus(t, granted, http.StatusNoContent)
	_ = granted.Body.Close()

	for _, kind := range []string{"avatar_part", "canvas_stamp", "canvas_prop"} {
		inventory := api.do(t, http.MethodGet, "/v1/me/unlocks?kind="+kind, masonToken, "", nil)
		assertStatus(t, inventory, http.StatusOK)
		body := readBody(inventory)
		_ = inventory.Body.Close()
		if kind == "avatar_part" && !strings.Contains(body, "avatar-head-dog") {
			t.Fatalf("avatar reward missing after fixture grant: %s", body)
		}
		if kind == "canvas_stamp" && !strings.Contains(body, "canvas-stamp-lion") {
			t.Fatalf("Canvas reward missing after fixture grant: %s", body)
		}
		if kind == "canvas_prop" && !strings.Contains(body, "canvas-prop-beach-ball") {
			t.Fatalf("Canvas prop missing after fixture grant: %s", body)
		}
	}
}
