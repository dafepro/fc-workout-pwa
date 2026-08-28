package teamlounge

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

const (
	BeachBoardwalkCanvasID      = "zoomigo-beach-boardwalk"
	BeachBoardwalkCanvasVersion = uint32(8)
)

type ThemeManifest struct {
	ID             string
	Version        uint32
	Name           string
	RoomGeneration uint32
	Template       roomsdk.RoomTemplate
}

type ThemeScheduleEntry struct {
	StartsOn string
	Theme    ThemeManifest
}

var platformThemeSchedule = []ThemeScheduleEntry{{
	StartsOn: "0001-01-01",
	Theme: ThemeManifest{
		ID: "beach-boardwalk", Version: 1, Name: "Beach Boardwalk", RoomGeneration: BeachBoardwalkCanvasVersion,
		Template: roomsdk.RoomTemplate{
			CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion,
		},
	},
}}

func WeeklyTheme(weekKey string) (ThemeManifest, error) {
	return themeForWeek(platformThemeSchedule, weekKey)
}

func themeForWeek(schedule []ThemeScheduleEntry, weekKey string) (ThemeManifest, error) {
	if !validWeekKey(weekKey) || len(schedule) == 0 {
		return ThemeManifest{}, errors.New("invalid weekly lounge theme")
	}
	var selected ThemeManifest
	previousStart := ""
	for _, entry := range schedule {
		if !validWeekKey(entry.StartsOn) || entry.StartsOn <= previousStart || !validTheme(entry.Theme) {
			return ThemeManifest{}, errors.New("invalid weekly lounge theme schedule")
		}
		previousStart = entry.StartsOn
		if entry.StartsOn <= weekKey {
			selected = entry.Theme
		}
	}
	if !validTheme(selected) {
		return ThemeManifest{}, errors.New("weekly lounge theme is not scheduled")
	}
	return selected, nil
}

func validTheme(theme ThemeManifest) bool {
	return validTeamID(theme.ID) && theme.Version > 0 && strings.TrimSpace(theme.Name) != "" &&
		theme.RoomGeneration > 0 && theme.Template.CanvasID != "" && theme.Template.CanvasVersion > 0
}

func WeeklyRoomID(teamID, weekKey string) (string, error) {
	if !validTeamID(teamID) || !validWeekKey(weekKey) {
		return "", errors.New("invalid weekly lounge identity")
	}
	theme, err := WeeklyTheme(weekKey)
	if err != nil {
		return "", err
	}
	return "team:" + teamID + ":lounge:" + weekKey + ":v" + strconv.FormatUint(uint64(theme.RoomGeneration), 10), nil
}

func ParseWeeklyRoomID(roomID string) (string, string, error) {
	remainder, ok := strings.CutPrefix(roomID, "team:")
	if !ok {
		return "", "", errors.New("invalid weekly lounge room")
	}
	teamID, versionedWeek, ok := strings.Cut(remainder, ":lounge:")
	if !ok {
		return "", "", errors.New("invalid weekly lounge room")
	}
	weekKey, version, ok := strings.Cut(versionedWeek, ":v")
	if !ok || !validTeamID(teamID) || !validWeekKey(weekKey) {
		return "", "", errors.New("invalid weekly lounge room")
	}
	theme, err := WeeklyTheme(weekKey)
	if err != nil || version != strconv.FormatUint(uint64(theme.RoomGeneration), 10) {
		return "", "", errors.New("invalid weekly lounge room")
	}
	return teamID, weekKey, nil
}

func validTeamID(value string) bool {
	if len(value) == 0 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if !unicode.IsLetter(character) && !unicode.IsDigit(character) && character != '-' && character != '_' {
			return false
		}
	}
	return true
}

func validWeekKey(value string) bool {
	weekStart, err := time.Parse(time.DateOnly, value)
	return err == nil && weekStart.Weekday() == time.Monday
}

func BeachBoardwalkCatalog() Catalog {
	catalog := Catalog{
		Canvases: []roomsdk.CanvasRecord{{
			CanvasID: BeachBoardwalkCanvasID, Version: BeachBoardwalkCanvasVersion,
			DefinitionRaw: json.RawMessage(beachBoardwalkCanvasJSON),
		}},
		Items: []roomsdk.ItemDefinitionRecord{
			{
				DefinitionID: "beach-ball", Version: 4, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(loungeBallConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(beachBallDefinitionJSON),
			},
			{
				DefinitionID: "avatar", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(avatarDefinitionJSON),
			},
		},
	}
	return catalog
}

func BeachBoardwalkDevelopmentCatalog() Catalog {
	catalog := BeachBoardwalkCatalog()
	for _, assetID := range []string{"bolt", "fire", "star", "soccer", "shield", "target", "rainbow", "lion", "rocket", "sparkles"} {
		catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
			DefinitionID:  "zoomigo-stamp-" + assetID,
			Version:       1,
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
			DefinitionRaw: loungeStampDefinitionJSON(assetID),
		})
	}
	catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
		DefinitionID: "zoomigo-prop-beach-ball", Version: 1,
		Complexity: roomsdk.ItemComplexitySimple, ConfigSchema: json.RawMessage(loungeBallConfigSchemaJSON),
		DefinitionRaw: json.RawMessage(beachBallPropDefinitionJSON),
	})
	return catalog
}

func loungeStampDefinitionJSON(assetID string) json.RawMessage {
	raw, err := json.Marshal(map[string]any{
		"definitionId": "zoomigo-stamp-" + assetID,
		"version":      1,
		"displayName":  assetID + " stamp",
		"visual": map[string]any{
			"size": map[string]float64{"width": 10, "height": 10}, "spriteId": "lounge.stamp.transparent",
			"placeholder": map[string]any{"shape": "circle", "color": 13234973}, "zIndex": 9,
		},
		"colliders": []any{}, "defaultConfig": map[string]any{},
		"persistence": map[string]any{"transform": true, "behaviorState": false, "onRoomSleep": "pause"},
		"complexity":  "simple",
	})
	if err != nil {
		panic(err)
	}
	return raw
}

const beachBoardwalkCanvasJSON = `{
  "id":"zoomigo-beach-boardwalk","version":8,
  "size":{"width":100,"height":150},"orientation":"topDown",
  "backgroundAssetId":"lounge.background",
  "edges":{"top":"solid","right":"solid","bottom":"solid","left":"solid"},
  "staticGeometry":[
    {"id":"lifeguard-hut","shape":{"type":"rect","width":38,"height":42},"position":{"x":79,"y":27},"rotation":0,"blocks":{"avatars":true,"items":false}},
    {"id":"umbrella-table","shape":{"type":"circle","radius":14},"position":{"x":18,"y":36},"blocks":{"avatars":true,"items":false}},
    {"id":"boardwalk-bench","shape":{"type":"rect","width":31,"height":21},"position":{"x":16,"y":108},"rotation":-0.12,"blocks":{"avatars":true,"items":false}},
    {"id":"snack-cart","shape":{"type":"rect","width":28,"height":49},"position":{"x":88,"y":116.5},"rotation":0.02,"blocks":{"avatars":true,"items":false}},
    {"id":"lower-pool-edge","shape":{"type":"rect","width":76,"height":16},"position":{"x":25,"y":141},"rotation":0.29,"blocks":{"avatars":true,"items":false}}
  ],
  "regions":[],
  "environment":{"base":{"gravityXY":{"x":0,"y":0},"linearDrag":0.07,"angularDrag":0.1,"softSpeedLimit":40,"surfaceFrictionMultiplier":1}},
  "spawnPoints":[{"id":"arrival","position":{"x":43,"y":92}}],
  "systemItems":[{"entityId":"boardwalk-beach-ball","definitionId":"beach-ball","definitionVersion":4,"transform":{"x":62,"y":98,"rotation":0,"scale":1},"resolvedConfig":{"sensorId":"kick","kickStrength":3.8,"pinchStrength":2.8,"maxImpulse":54,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16}}],
  "limits":{"maxAvatars":24,"maxItems":169,"maxComplexPhysicsItems":4},
  "avatarController":{"radius":4,"maxSpeed":26,"acceleration":125,"flickDeceleration":42,"maxTurnSpeed":9,"facing":"fixed","directInteractionMaxSpeed":32},
  "terrainDefaults":{"avatars":true,"items":true}
}`

const beachBallPropDefinitionJSON = `{
  "definitionId":"zoomigo-prop-beach-ball","version":1,"displayName":"Beach ball prop",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.stamp.transparent","placeholder":{"shape":"circle","color":16765757},"zIndex":8},
  "body":{"mode":"dynamic","mass":0.5,"gravityScale":0,"linearDamping":0.12,"angularDamping":0.12,"canSleep":true},
  "colliders":[
    {"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.82,"friction":0.18,"collisionMask":60},
    {"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}
  ],
  "behaviorType":"zoomigoLoungeBall","defaultConfig":{"sensorId":"kick","kickStrength":3.8,"pinchStrength":2.8,"maxImpulse":54,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`

const beachBallDefinitionJSON = `{
  "definitionId":"beach-ball","version":4,"displayName":"Beach ball",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.ball","placeholder":{"shape":"circle","color":16765757},"zIndex":8},
  "body":{"mode":"dynamic","mass":0.5,"gravityScale":0,"linearDamping":0.12,"angularDamping":0.12,"canSleep":true},
  "colliders":[
    {"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.82,"friction":0.18,"collisionMask":60},
    {"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}
  ],
  "behaviorType":"zoomigoLoungeBall","defaultConfig":{"sensorId":"kick","kickStrength":3.8,"pinchStrength":2.8,"maxImpulse":54,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`

const avatarDefinitionJSON = `{
  "definitionId":"avatar","version":1,"displayName":"Player avatar",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.stamp.transparent","placeholder":{"shape":"circle","color":1923719},"zIndex":12},
  "colliders":[],"defaultConfig":{},
  "persistence":{"transform":false,"behaviorState":false,"onRoomSleep":"pause"},"complexity":"simple"
}`

const loungeBallConfigSchemaJSON = `{
  "type":"object",
  "properties":{"sensorId":{"type":"string"},"kickStrength":{"type":"number"},"pinchStrength":{"type":"number"},"maxImpulse":{"type":"number"},"tangentialStrength":{"type":"number"},"maxTangentialImpulse":{"type":"number"},"spinTransfer":{"type":"number"},"spinRadius":{"type":"number"},"maxAngularSpeed":{"type":"number"},"cooldownSeconds":{"type":"number"}},
  "required":["sensorId","kickStrength","pinchStrength","maxImpulse","tangentialStrength","maxTangentialImpulse","spinTransfer","spinRadius","maxAngularSpeed","cooldownSeconds"],
  "additionalProperties":false
}`

const emptyConfigSchemaJSON = `{"type":"object","additionalProperties":false}`
