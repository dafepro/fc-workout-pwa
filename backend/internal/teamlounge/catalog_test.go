package teamlounge

import (
	"encoding/json"
	"testing"
)

func TestWeeklyRoomIdentityRoundTrips(t *testing.T) {
	roomID, err := WeeklyRoomID("team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	if roomID != "team:team-one:lounge:2026-08-24" {
		t.Fatalf("room id = %q", roomID)
	}
	teamID, weekKey, err := ParseWeeklyRoomID(roomID)
	if err != nil || teamID != "team-one" || weekKey != "2026-08-24" {
		t.Fatalf("parsed = %q, %q, %v", teamID, weekKey, err)
	}
	for _, invalid := range []string{"", "team:other", "team:team/one:lounge:2026-08-24", "team:team-one:lounge:today", "team:team-one:lounge:2026-08-25"} {
		if _, _, err := ParseWeeklyRoomID(invalid); err == nil {
			t.Fatalf("accepted invalid room id %q", invalid)
		}
	}
}

func TestBeachBoardwalkCatalogMatchesClientContract(t *testing.T) {
	catalog := BeachBoardwalkCatalog()
	if len(catalog.Canvases) != 1 || len(catalog.Items) != 2 {
		t.Fatalf("catalog sizes = %d canvases, %d items", len(catalog.Canvases), len(catalog.Items))
	}
	canvas := catalog.Canvases[0]
	if canvas.CanvasID != BeachBoardwalkCanvasID || canvas.Version != BeachBoardwalkCanvasVersion || !json.Valid(canvas.DefinitionRaw) {
		t.Fatalf("canvas record = %#v", canvas)
	}
	var shape struct {
		ID          string `json:"id"`
		Version     uint32 `json:"version"`
		SystemItems []struct {
			DefinitionID string `json:"definitionId"`
		} `json:"systemItems"`
	}
	if err := json.Unmarshal(canvas.DefinitionRaw, &shape); err != nil {
		t.Fatal(err)
	}
	if shape.ID != canvas.CanvasID || shape.Version != canvas.Version || len(shape.SystemItems) != 1 || shape.SystemItems[0].DefinitionID != "beach-ball" {
		t.Fatalf("canvas shape = %#v", shape)
	}
}
