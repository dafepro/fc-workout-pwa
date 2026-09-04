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
	if roomID != "team:team-one:lounge:v21" {
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
	for _, invalid := range []string{"", "team:other", "team:team/one:lounge:v21", "team:team-one:lounge:today", "team:team-one:lounge", "team:team-one:lounge:v20"} {
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
	if theme.RoomGeneration != 21 {
		t.Fatalf("room generation = %d, want interaction-control generation 21", theme.RoomGeneration)
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
	if canvas.Version != 21 {
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
			ZIndex   int    `json:"zIndex"`
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
	if ball.Version != 9 || ball.Visual.SpriteID != "lounge.ball" || ball.Visual.ZIndex != 20 || len(ball.Colliders) < 1 || ball.Colliders[0].CollisionMask != 28 || ball.Colliders[0].Restitution != 0.95 || len(ball.Colliders[0].Tags) != 1 || ball.Colliders[0].Tags[0] != "lounge-ball" {
		t.Fatalf("beach ball definition = %#v", ball)
	}
	var avatar struct {
		Version uint32 `json:"version"`
		Visual  struct {
			SpriteID string `json:"spriteId"`
			ZIndex   int    `json:"zIndex"`
		} `json:"visual"`
	}
	if err := json.Unmarshal(catalog.Items[1].DefinitionRaw, &avatar); err != nil {
		t.Fatal(err)
	}
	if avatar.Version != 2 || avatar.Visual.SpriteID != "lounge.stamp.transparent" || avatar.Visual.ZIndex != 30 {
		t.Fatalf("avatar definition = %#v", avatar)
	}
}

func TestDevelopmentCatalogAddsOnlyPredefinedLoungeItems(t *testing.T) {
	catalog := BeachBoardwalkLoungeCatalog()
	if len(catalog.Items) != 41 {
		t.Fatalf("development item count = %d", len(catalog.Items))
	}
	for _, item := range catalog.Items[3:13] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-stamp-") || item.Version != 3 {
			t.Fatalf("development item = %#v", item)
		}
	}
	for _, item := range catalog.Items[13:21] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-stamp-silly-") || item.Version != 1 {
			t.Fatalf("included silly stamp = %#v", item)
		}
	}
	for _, item := range catalog.Items[21:25] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-prop-starlight-") || item.Version != 3 {
			t.Fatalf("included Starlight item = %#v", item)
		}
	}
	combinations := map[string]bool{}
	var compositeSchema struct {
		Properties map[string]struct {
			Items struct {
				Properties map[string]struct {
					Type string   `json:"type"`
					Enum []string `json:"enum"`
				} `json:"properties"`
				Required             []string `json:"required"`
				AdditionalProperties bool     `json:"additionalProperties"`
			} `json:"items"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(catalog.Items[25].ConfigSchema, &compositeSchema); err != nil {
		t.Fatal(err)
	}
	effectItems := compositeSchema.Properties["effects"].Items
	kindSchema, declaresKind := effectItems.Properties["kind"]
	if !declaresKind || kindSchema.Type != "string" || len(kindSchema.Enum) != 15 ||
		len(effectItems.Required) != 1 || effectItems.Required[0] != "kind" || !effectItems.AdditionalProperties {
		t.Fatalf("composite effect config schema = %#v", effectItems)
	}
	allowedEffects := make(map[string]bool, len(kindSchema.Enum))
	for _, kind := range kindSchema.Enum {
		allowedEffects[kind] = true
	}
	wantComposite := []struct {
		id      string
		version uint32
		effects []string
	}{
		{"boost-pad", 4, []string{"boost", "hop"}},
		{"bounce-drum", 3, []string{"bounce", "wobble"}},
		{"pinwheel", 3, []string{"spin", "push"}},
		{"orbit-beacon", 3, []string{"spin", "orbit"}},
		{"breeze-fan", 3, []string{"spin", "push"}},
		{"soft-sand-mat", 3, []string{"dampen", "orbit"}},
		{"speed-lane", 4, []string{"dampen", "accelerate"}},
		{"wobble-cone", 4, []string{"bounce", "wobble"}},
		{"swing-gate", 3, []string{"swing", "bounce"}},
		{"mini-goal", 5, []string{"dampen", "goal"}},
		{"ball-cannon", 2, []string{"dampen", "cannon"}},
		{"duck-pond", 5, []string{"flock", "dampen"}},
		{"hammock", 5, []string{"rest"}},
		{"robot-goalie", 4, []string{"goalie", "bounce"}},
		{"pinball-bumper", 5, []string{"bounce", "hop"}},
	}
	for index, item := range catalog.Items[25:40] {
		want := wantComposite[index]
		if item.DefinitionID != "zoomigo-prop-play-"+want.id || item.Version != want.version {
			t.Fatalf("composite Lounge item = %#v", item)
		}
		var definition struct {
			BehaviorType string           `json:"behaviorType"`
			Body         map[string]any   `json:"body"`
			Colliders    []map[string]any `json:"colliders"`
			Visual       struct {
				ZIndex int `json:"zIndex"`
			} `json:"visual"`
			DefaultConfig struct {
				Effects []map[string]any `json:"effects"`
			} `json:"defaultConfig"`
		}
		if err := json.Unmarshal(item.DefinitionRaw, &definition); err != nil {
			t.Fatal(err)
		}
		if definition.BehaviorType != "zoomigoLoungeComposite" || len(definition.Colliders) == 0 || len(definition.DefaultConfig.Effects) < 1 {
			t.Fatalf("composite Lounge definition = %#v", definition)
		}
		wantZIndex := 10
		if want.id == "boost-pad" || want.id == "soft-sand-mat" || want.id == "speed-lane" || want.id == "duck-pond" {
			wantZIndex = 6
		}
		if definition.Visual.ZIndex != wantZIndex {
			t.Fatalf("%s visual layer = %d, want %d", want.id, definition.Visual.ZIndex, wantZIndex)
		}
		for _, collider := range definition.Colliders {
			if collider["role"] == "itemSolid" && collider["collisionMask"] != float64(12) {
				t.Fatalf("%s solid collision mask = %#v, want item/world only", want.id, collider["collisionMask"])
			}
		}
		for effectIndex, effect := range definition.DefaultConfig.Effects {
			if effect["kind"] != want.effects[effectIndex] {
				t.Fatalf("%s effect %d = %#v", want.id, effectIndex, effect)
			}
			if !allowedEffects[want.effects[effectIndex]] {
				t.Fatalf("%s effect %q is absent from the config schema", want.id, want.effects[effectIndex])
			}
		}
		if want.id == "mini-goal" {
			mouth := definition.Colliders[3]
			shape, _ := mouth["shape"].(map[string]any)
			offset, _ := mouth["offset"].(map[string]any)
			if mouth["id"] != "mouth" || shape["width"] != float64(11) || shape["height"] != float64(2) ||
				offset["x"] != float64(0) || offset["y"] != -2.5 {
				t.Fatalf("mini-goal mouth collider = %#v", mouth)
			}
			goal := definition.DefaultConfig.Effects[1]
			ejectOffset, _ := goal["ejectOffset"].(map[string]any)
			acceptedDefinitions, _ := goal["acceptedDefinitionIds"].([]any)
			if goal["holdSeconds"] != 0.4 || goal["ejectSpeed"] != float64(18) ||
				ejectOffset["x"] != float64(0) || ejectOffset["y"] != float64(8) ||
				len(acceptedDefinitions) != 2 || acceptedDefinitions[0] != "beach-ball" ||
				acceptedDefinitions[1] != "zoomigo-prop-beach-ball" {
				t.Fatalf("mini-goal config = %#v", goal)
			}
		}
		if want.id == "ball-cannon" {
			if len(definition.Colliders) != 2 {
				t.Fatalf("ball-cannon colliders = %#v", definition.Colliders)
			}
			frontStop := definition.Colliders[1]
			shape, _ := frontStop["shape"].(map[string]any)
			offset, _ := frontStop["offset"].(map[string]any)
			if frontStop["id"] != "front-stop" || frontStop["role"] != "itemSolid" ||
				shape["width"] != float64(2) || shape["height"] != float64(8) ||
				offset["x"] != float64(4) || offset["y"] != float64(0) {
				t.Fatalf("ball-cannon front stop = %#v", frontStop)
			}
			cannon := definition.DefaultConfig.Effects[1]
			if cannon["speed"] != float64(50) || cannon["dwellSeconds"] != 0.8 {
				t.Fatalf("ball-cannon launch config = %#v", cannon)
			}
		}
		if want.id == "robot-goalie" {
			goalie := definition.DefaultConfig.Effects[0]
			if goalie["travel"] != float64(8) || goalie["maxSpeed"] != float64(18) {
				t.Fatalf("robot goalie config = %#v", goalie)
			}
		}
		if want.id == "pinball-bumper" {
			bumper := definition.DefaultConfig.Effects[0]
			if bumper["impulse"] != float64(56) || bumper["directionRadians"] != -1.5707963267948966 {
				t.Fatalf("pinball bumper config = %#v", bumper)
			}
		}
		combination, err := json.Marshal(definition.DefaultConfig.Effects)
		if err != nil {
			t.Fatal(err)
		}
		combinations[string(combination)] = true
	}
	if len(combinations) != 15 {
		t.Fatalf("composite behavior combinations = %d", len(combinations))
	}
	if item := catalog.Items[40]; item.DefinitionID != "zoomigo-prop-beach-ball" || item.Version != 6 {
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
	if itemID, included := loungePlacementItem("zoomigo-prop-play-duck-pond"); itemID != "lounge-prop-duck-pond" || included {
		t.Fatalf("earned composite placement item = %q, included %v", itemID, included)
	}
	if itemID, included := loungePlacementItem("zoomigo-stamp-silly-silly-goose"); itemID != "zoomigo-stamp-silly-silly-goose" || !included {
		t.Fatalf("silly stamp placement item = %q, included %v", itemID, included)
	}
}
