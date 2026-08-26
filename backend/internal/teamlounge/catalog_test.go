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
	if roomID != "team:team-one:lounge:2026-08-24:v3" {
		t.Fatalf("room id = %q", roomID)
	}
	teamID, weekKey, err := ParseWeeklyRoomID(roomID)
	if err != nil || teamID != "team-one" || weekKey != "2026-08-24" {
		t.Fatalf("parsed = %q, %q, %v", teamID, weekKey, err)
	}
	for _, invalid := range []string{"", "team:other", "team:team/one:lounge:2026-08-24:v3", "team:team-one:lounge:today:v3", "team:team-one:lounge:2026-08-25:v3", "team:team-one:lounge:2026-08-24", "team:team-one:lounge:2026-08-24:v2"} {
		if _, _, err := ParseWeeklyRoomID(invalid); err == nil {
			t.Fatalf("accepted invalid room id %q", invalid)
		}
	}
}

func TestWeeklyThemeManifestOwnsTheImmutableCanvasBinding(t *testing.T) {
	theme, err := WeeklyTheme("2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	if theme.ID != "beach-boardwalk" || theme.Version != 1 || theme.Name != "Beach Boardwalk" {
		t.Fatalf("theme identity = %#v", theme)
	}
	if theme.Template.CanvasID != BeachBoardwalkCanvasID || theme.Template.CanvasVersion != BeachBoardwalkCanvasVersion {
		t.Fatalf("theme template = %#v", theme.Template)
	}
	if _, err := WeeklyTheme("today"); err == nil {
		t.Fatal("accepted invalid week key")
	}
}

func TestBeachBoardwalkCatalogMatchesClientContract(t *testing.T) {
	catalog := BeachBoardwalkCatalog()
	if len(catalog.Canvases) != 1 || len(catalog.Items) != 14 {
		t.Fatalf("catalog sizes = %d canvases, %d items", len(catalog.Canvases), len(catalog.Items))
	}
	canvas := catalog.Canvases[0]
	if canvas.CanvasID != BeachBoardwalkCanvasID || canvas.Version != BeachBoardwalkCanvasVersion || !json.Valid(canvas.DefinitionRaw) {
		t.Fatalf("canvas record = %#v", canvas)
	}
	if canvas.Version != 3 {
		t.Fatalf("canvas version = %d", canvas.Version)
	}
	var shape struct {
		ID      string `json:"id"`
		Version uint32 `json:"version"`
		Limits  struct {
			MaxAvatars int `json:"maxAvatars"`
			MaxItems   int `json:"maxItems"`
		} `json:"limits"`
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
	if shape.Limits.MaxAvatars != 24 || shape.Limits.MaxItems != 1+24*7 {
		t.Fatalf("weekly placement capacity = %#v", shape.Limits)
	}
	var stamp struct {
		Visual struct {
			SpriteID string `json:"spriteId"`
		} `json:"visual"`
	}
	if err := json.Unmarshal(catalog.Items[2].DefinitionRaw, &stamp); err != nil {
		t.Fatal(err)
	}
	if stamp.Visual.SpriteID != "lounge.stamp.transparent" {
		t.Fatalf("stamp sprite = %q", stamp.Visual.SpriteID)
	}
}
