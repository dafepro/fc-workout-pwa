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

func TestWeeklyRoomIdentityRoundTrips(t *testing.T) {
	roomID, err := WeeklyRoomID("team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	if roomID != "team:team-one:lounge:2026-08-24:v9" {
		t.Fatalf("room id = %q", roomID)
	}
	teamID, weekKey, err := ParseWeeklyRoomID(roomID)
	if err != nil || teamID != "team-one" || weekKey != "2026-08-24" {
		t.Fatalf("parsed = %q, %q, %v", teamID, weekKey, err)
	}
	for _, invalid := range []string{"", "team:other", "team:team/one:lounge:2026-08-24:v9", "team:team-one:lounge:today:v9", "team:team-one:lounge:2026-08-25:v9", "team:team-one:lounge:2026-08-24", "team:team-one:lounge:2026-08-24:v8"} {
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
	if theme.RoomGeneration != BeachBoardwalkCanvasVersion {
		t.Fatalf("room generation = %d", theme.RoomGeneration)
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
	if len(catalog.Canvases) != 1 || len(catalog.Items) != 2 {
		t.Fatalf("catalog sizes = %d canvases, %d items", len(catalog.Canvases), len(catalog.Items))
	}
	canvas := catalog.Canvases[0]
	if canvas.CanvasID != BeachBoardwalkCanvasID || canvas.Version != BeachBoardwalkCanvasVersion || !json.Valid(canvas.DefinitionRaw) {
		t.Fatalf("canvas record = %#v", canvas)
	}
	if canvas.Version != 9 {
		t.Fatalf("canvas version = %d", canvas.Version)
	}
	var shape struct {
		ID             string            `json:"id"`
		Version        uint32            `json:"version"`
		Edges          map[string]string `json:"edges"`
		StaticGeometry []struct {
			Blocks struct {
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
	if shape.ID != canvas.CanvasID || shape.Version != canvas.Version || len(shape.SystemItems) != 1 || shape.SystemItems[0].DefinitionID != "beach-ball" {
		t.Fatalf("canvas shape = %#v", shape)
	}
	for _, edge := range []string{"top", "right", "bottom", "left"} {
		if shape.Edges[edge] != "solid" {
			t.Fatalf("canvas edge %s = %q", edge, shape.Edges[edge])
		}
	}
	if len(shape.StaticGeometry) != 0 {
		t.Fatalf("boardwalk scenery must not block players or balls: %#v", shape.StaticGeometry)
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
			ID            string `json:"id"`
			CollisionMask uint32 `json:"collisionMask"`
		} `json:"colliders"`
	}
	if err := json.Unmarshal(catalog.Items[0].DefinitionRaw, &ball); err != nil {
		t.Fatal(err)
	}
	if ball.Version != 5 || ball.Visual.SpriteID != "lounge.ball" || len(ball.Colliders) < 1 || ball.Colliders[0].CollisionMask != 4 {
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
	catalog := BeachBoardwalkDevelopmentCatalog()
	if len(catalog.Items) != 13 {
		t.Fatalf("development item count = %d", len(catalog.Items))
	}
	for _, item := range catalog.Items[2:12] {
		if !strings.HasPrefix(item.DefinitionID, "zoomigo-stamp-") || item.Version != 1 {
			t.Fatalf("development item = %#v", item)
		}
	}
	if item := catalog.Items[12]; item.DefinitionID != "zoomigo-prop-beach-ball" || item.Version != 2 {
		t.Fatalf("development prop = %#v", item)
	}
}
