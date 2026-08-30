package teamlounge

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestTeamWeekUsesTheTeamLocalMondayAcrossDaylightSavingChanges(t *testing.T) {
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name         string
		now          time.Time
		wantWeek     string
		wantDay      string
		wantDuration time.Duration
	}{
		{
			name:     "spring Sunday before local Monday",
			now:      time.Date(2026, time.March, 9, 4, 59, 0, 0, time.UTC),
			wantWeek: "2026-03-02", wantDay: "2026-03-08", wantDuration: 167 * time.Hour,
		},
		{
			name:     "spring Monday after local midnight",
			now:      time.Date(2026, time.March, 9, 5, 1, 0, 0, time.UTC),
			wantWeek: "2026-03-09", wantDay: "2026-03-09", wantDuration: 168 * time.Hour,
		},
		{
			name:     "fall Sunday before local Monday",
			now:      time.Date(2026, time.November, 2, 5, 59, 0, 0, time.UTC),
			wantWeek: "2026-10-26", wantDay: "2026-11-01", wantDuration: 169 * time.Hour,
		},
		{
			name:     "fall Monday after local midnight",
			now:      time.Date(2026, time.November, 2, 6, 1, 0, 0, time.UTC),
			wantWeek: "2026-11-02", wantDay: "2026-11-02", wantDuration: 168 * time.Hour,
		},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			week, err := TeamWeek(test.now, location)
			if err != nil {
				t.Fatal(err)
			}
			if week.Key != test.wantWeek || week.DayKey != test.wantDay || week.End.Sub(week.Start) != test.wantDuration {
				t.Fatalf("team week = %+v, duration %s", week, week.End.Sub(week.Start))
			}
		})
	}
}

func TestPlatformThemeScheduleIsAppendOnlyAndDeterministic(t *testing.T) {
	beach := ThemeManifest{
		ID: "beach-boardwalk", Version: 1, Name: "Beach Boardwalk", RoomGeneration: 3,
		Template: roomsdk.RoomTemplate{CanvasID: "beach", CanvasVersion: 3},
	}
	campfire := ThemeManifest{
		ID: "campfire-night", Version: 1, Name: "Campfire Night", RoomGeneration: 4,
		Template: roomsdk.RoomTemplate{CanvasID: "campfire", CanvasVersion: 1},
	}
	schedule := []ThemeScheduleEntry{
		{StartsOn: "2026-08-24", Theme: beach},
		{StartsOn: "2026-09-07", Theme: campfire},
	}
	for weekKey, want := range map[string]ThemeManifest{
		"2026-08-24": beach,
		"2026-08-31": beach,
		"2026-09-07": campfire,
		"2026-09-14": campfire,
	} {
		got, err := themeForWeek(schedule, weekKey)
		if err != nil || got != want {
			t.Fatalf("theme for %s = %#v, %v; want %#v", weekKey, got, err, want)
		}
	}
	invalid := []ThemeScheduleEntry{
		{StartsOn: "2026-09-07", Theme: campfire},
		{StartsOn: "2026-08-24", Theme: beach},
	}
	if _, err := themeForWeek(invalid, "2026-09-07"); err == nil {
		t.Fatal("accepted a schedule whose effective weeks move backward")
	}
}

func TestDurableRoomIdentityPersistsAcrossWeekRollover(t *testing.T) {
	roomID, err := DurableRoomID("team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	if roomID != "team:team-one:lounge:v13" {
		t.Fatalf("room id = %q", roomID)
	}
	nextWeek, err := DurableRoomID("team-one", "2026-08-31")
	if err != nil || nextWeek != roomID {
		t.Fatalf("next week room = %q, %v; want %q", nextWeek, err, roomID)
	}
	teamID, err := ParseRoomID(roomID)
	if err != nil || teamID != "team-one" {
		t.Fatalf("parsed = %q, %v", teamID, err)
	}
	for _, invalid := range []string{"", "team:other", "team:team/one:lounge:v13", "team:team-one:lounge:today", "team:team-one:lounge", "team:team-one:lounge:v12"} {
		if _, err := ParseRoomID(invalid); err == nil {
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
	if theme.RoomGeneration != BeachBoardwalkRoomGeneration {
		t.Fatalf("room generation = %d", theme.RoomGeneration)
	}
	if theme.RoomGeneration != 13 {
		t.Fatalf("room generation = %d, want clean-cutover generation 13", theme.RoomGeneration)
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
	if len(catalog.Canvases) != 1 || len(catalog.Items) != 3 {
		t.Fatalf("catalog sizes = %d canvases, %d items", len(catalog.Canvases), len(catalog.Items))
	}
	canvas := catalog.Canvases[0]
	if canvas.CanvasID != BeachBoardwalkCanvasID || canvas.Version != BeachBoardwalkCanvasVersion || !json.Valid(canvas.DefinitionRaw) {
		t.Fatalf("canvas record = %#v", canvas)
	}
	if canvas.Version != 13 {
		t.Fatalf("canvas version = %d", canvas.Version)
	}
	var shape struct {
		ID             string            `json:"id"`
		Version        uint32            `json:"version"`
		Edges          map[string]string `json:"edges"`
		StaticGeometry []struct {
			ID          string   `json:"id"`
			Restitution float64  `json:"restitution"`
			Friction    float64  `json:"friction"`
			Tags        []string `json:"tags"`
			Blocks      struct {
				Avatars bool `json:"avatars"`
				Items   bool `json:"items"`
			} `json:"blocks"`
		} `json:"staticGeometry"`
		SpawnPoints []struct {
			ID string `json:"id"`
		} `json:"spawnPoints"`
		Respawn struct {
			DelaySeconds      float64 `json:"delaySeconds"`
			SpawnPointID      string  `json:"spawnPointId"`
			ApplyToQuarantine bool    `json:"applyToQuarantine"`
		} `json:"respawn"`
		Limits struct {
			MaxAvatars int `json:"maxAvatars"`
			MaxItems   int `json:"maxItems"`
		} `json:"limits"`
		SystemItems []struct {
			DefinitionID string `json:"definitionId"`
			Transform    struct {
				Scale float64 `json:"scale"`
			} `json:"transform"`
		} `json:"systemItems"`
	}
	if err := json.Unmarshal(canvas.DefinitionRaw, &shape); err != nil {
		t.Fatal(err)
	}
	if shape.ID != canvas.CanvasID || shape.Version != canvas.Version || len(shape.SystemItems) != 2 ||
		shape.SystemItems[0].DefinitionID != "beach-ball" ||
		shape.SystemItems[1].DefinitionID != "zoomigo-lounge-action-router" {
		t.Fatalf("canvas shape = %#v", shape)
	}
	for _, edge := range []string{"top", "right", "bottom", "left"} {
		if shape.Edges[edge] != "open" {
			t.Fatalf("canvas edge %s = %q", edge, shape.Edges[edge])
		}
	}
	if len(shape.StaticGeometry) != 4 {
		t.Fatalf("elastic boundary count = %d", len(shape.StaticGeometry))
	}
	for _, boundary := range shape.StaticGeometry {
		if boundary.Restitution != 1 || boundary.Friction != 0 || len(boundary.Tags) != 1 || boundary.Tags[0] != "elastic-edge" ||
			!boundary.Blocks.Avatars || !boundary.Blocks.Items {
			t.Fatalf("elastic boundary = %#v", boundary)
		}
	}
	if len(shape.SpawnPoints) != 1 || shape.SpawnPoints[0].ID != "arrival" {
		t.Fatalf("canvas spawn points = %#v", shape.SpawnPoints)
	}
	if shape.SystemItems[0].Transform.Scale != 1 {
		t.Fatalf("beach ball scale = %v", shape.SystemItems[0].Transform.Scale)
	}
	if shape.Limits.MaxAvatars != 24 || shape.Limits.MaxItems != 1+24*7 {
		t.Fatalf("weekly placement capacity = %#v", shape.Limits)
	}
	var ball struct {
		Version uint32 `json:"version"`
		Visual  struct {
			SpriteID string `json:"spriteId"`
		} `json:"visual"`
		Colliders []struct {
			ID            string   `json:"id"`
			CollisionMask uint32   `json:"collisionMask"`
			Restitution   float64  `json:"restitution"`
			Tags          []string `json:"tags"`
		} `json:"colliders"`
	}
	if err := json.Unmarshal(catalog.Items[0].DefinitionRaw, &ball); err != nil {
		t.Fatal(err)
	}
	if ball.Version != 6 || ball.Visual.SpriteID != "lounge.ball" || len(ball.Colliders) < 1 || ball.Colliders[0].CollisionMask != 4 || ball.Colliders[0].Restitution != 0.95 || len(ball.Colliders[0].Tags) != 1 || ball.Colliders[0].Tags[0] != "lounge-ball" {
		t.Fatalf("beach ball definition = %#v", ball)
	}
	var avatar struct {
		Visual struct {
			SpriteID string `json:"spriteId"`
		} `json:"visual"`
	}
	if err := json.Unmarshal(catalog.Items[1].DefinitionRaw, &avatar); err != nil {
		t.Fatal(err)
	}
	if avatar.Visual.SpriteID != "lounge.stamp.transparent" {
		t.Fatalf("avatar sprite = %q", avatar.Visual.SpriteID)
	}
}

func TestDevelopmentCatalogAddsOnlyPredefinedLoungeItems(t *testing.T) {
	catalog := BeachBoardwalkLoungeCatalog()
	if len(catalog.Items) != 28 {
		t.Fatalf("development item count = %d", len(catalog.Items))
	}
	for _, item := range catalog.Items[3:13] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-stamp-") || item.Version != 2 {
			t.Fatalf("development item = %#v", item)
		}
	}
	for _, item := range catalog.Items[13:17] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-prop-starlight-") || item.Version != 2 {
			t.Fatalf("included Starlight item = %#v", item)
		}
	}
	combinations := map[string]bool{}
	wantComposite := []struct {
		id      string
		effects []string
	}{
		{"boost-pad", []string{"boost", "hop"}},
		{"bounce-drum", []string{"bounce", "wobble"}},
		{"pinwheel", []string{"spin", "push"}},
		{"orbit-beacon", []string{"spin", "orbit"}},
		{"breeze-fan", []string{"spin", "push"}},
		{"soft-sand-mat", []string{"dampen", "orbit"}},
		{"speed-lane", []string{"boost", "push"}},
		{"wobble-cone", []string{"bounce", "wobble"}},
		{"swing-gate", []string{"swing", "bounce"}},
		{"mini-goal", []string{"dampen", "goal"}},
	}
	for index, item := range catalog.Items[17:27] {
		want := wantComposite[index]
		if item.DefinitionID != "zoomigo-prop-play-"+want.id || item.Version != 1 {
			t.Fatalf("composite Lounge item = %#v", item)
		}
		var definition struct {
			BehaviorType  string           `json:"behaviorType"`
			Body          map[string]any   `json:"body"`
			Colliders     []map[string]any `json:"colliders"`
			DefaultConfig struct {
				Effects []map[string]any `json:"effects"`
			} `json:"defaultConfig"`
		}
		if err := json.Unmarshal(item.DefinitionRaw, &definition); err != nil {
			t.Fatal(err)
		}
		if definition.BehaviorType != "zoomigoLoungeComposite" || len(definition.Colliders) == 0 || len(definition.DefaultConfig.Effects) < 2 {
			t.Fatalf("composite Lounge definition = %#v", definition)
		}
		for effectIndex, effect := range definition.DefaultConfig.Effects {
			if effect["kind"] != want.effects[effectIndex] {
				t.Fatalf("%s effect %d = %#v", want.id, effectIndex, effect)
			}
		}
		combination, err := json.Marshal(definition.DefaultConfig.Effects)
		if err != nil {
			t.Fatal(err)
		}
		combinations[string(combination)] = true
	}
	if len(combinations) != 10 {
		t.Fatalf("composite behavior combinations = %d", len(combinations))
	}
	if item := catalog.Items[27]; item.DefinitionID != "zoomigo-prop-beach-ball" || item.Version != 3 {
		t.Fatalf("development prop = %#v", item)
	}
}

func TestCompositeLoungeItemsAreIncludedButUnrecognizedDefinitionsStayLocked(t *testing.T) {
	itemID, included := loungePlacementItem("zoomigo-prop-play-boost-pad")
	if itemID != "zoomigo-prop-play-boost-pad" || !included {
		t.Fatalf("composite placement item = %q, included %v", itemID, included)
	}
	if itemID, included := loungePlacementItem("zoomigo-prop-play-custom"); itemID != "" || included {
		t.Fatalf("unknown composite placement item = %q, included %v", itemID, included)
	}
}
