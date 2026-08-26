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
	BeachBoardwalkCanvasVersion = uint32(3)
)

func WeeklyRoomID(teamID, weekKey string) (string, error) {
	if !validTeamID(teamID) || !validWeekKey(weekKey) {
		return "", errors.New("invalid weekly lounge identity")
	}
	return "team:" + teamID + ":lounge:" + weekKey + ":v" + strconv.FormatUint(uint64(BeachBoardwalkCanvasVersion), 10), nil
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
	if !ok || version != strconv.FormatUint(uint64(BeachBoardwalkCanvasVersion), 10) || !validTeamID(teamID) || !validWeekKey(weekKey) {
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
				DefinitionID: "beach-ball", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(kickableConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(beachBallDefinitionJSON),
			},
			{
				DefinitionID: "avatar", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(avatarDefinitionJSON),
			},
		},
	}
	catalog.Items = append(catalog.Items, stampDefinitionRecords()...)
	return catalog
}

const beachBoardwalkCanvasJSON = `{
  "id":"zoomigo-beach-boardwalk","version":3,
  "size":{"width":100,"height":150},"orientation":"topDown",
  "backgroundAssetId":"lounge.background",
  "edges":{"top":"solid","right":"solid","bottom":"solid","left":"solid"},
  "staticGeometry":[
    {"id":"lifeguard-hut","shape":{"type":"rect","width":38,"height":42},"position":{"x":79,"y":27},"rotation":0,"blocks":{"avatars":true,"items":true}},
    {"id":"umbrella-table","shape":{"type":"circle","radius":14},"position":{"x":18,"y":36},"blocks":{"avatars":true,"items":true}},
    {"id":"boardwalk-bench","shape":{"type":"rect","width":31,"height":21},"position":{"x":16,"y":108},"rotation":-0.12,"blocks":{"avatars":true,"items":true}},
    {"id":"snack-cart","shape":{"type":"rect","width":28,"height":49},"position":{"x":88,"y":116.5},"rotation":0.02,"blocks":{"avatars":true,"items":true}},
    {"id":"lower-pool-edge","shape":{"type":"rect","width":76,"height":16},"position":{"x":25,"y":141},"rotation":0.29,"blocks":{"avatars":true,"items":true}}
  ],
  "regions":[],
  "environment":{"base":{"gravityXY":{"x":0,"y":0},"linearDrag":0.2,"angularDrag":0.2,"softSpeedLimit":28,"surfaceFrictionMultiplier":1}},
  "spawnPoints":[{"id":"arrival","position":{"x":43,"y":92}}],
  "systemItems":[{"entityId":"boardwalk-beach-ball","definitionId":"beach-ball","definitionVersion":1,"transform":{"x":62,"y":98,"rotation":0},"resolvedConfig":{"sensorId":"kick","kickStrength":1.25,"minImpulse":0,"maxImpulse":18,"cooldownSeconds":0.25}}],
  "limits":{"maxAvatars":24,"maxItems":169,"maxComplexPhysicsItems":4},
  "avatarController":{"radius":4,"maxSpeed":26,"acceleration":125,"flickDeceleration":42,"maxTurnSpeed":9,"facing":"fixed","directInteractionMaxSpeed":32},
  "terrainDefaults":{"avatars":true,"items":true}
}`

const beachBallDefinitionJSON = `{
  "definitionId":"beach-ball","version":1,"displayName":"Beach ball",
  "visual":{"size":{"width":9,"height":9},"placeholder":{"shape":"circle","color":16765757},"zIndex":8},
  "body":{"mode":"dynamic","mass":0.35,"gravityScale":0,"linearDamping":0.4,"angularDamping":0.55,"canSleep":true},
  "colliders":[
    {"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.82,"friction":0.18,"collisionMask":28},
    {"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}
  ],
  "behaviorType":"kickable","defaultConfig":{"sensorId":"kick","kickStrength":1.25,"minImpulse":0,"maxImpulse":18,"cooldownSeconds":0.25},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`

const avatarDefinitionJSON = `{
  "definitionId":"avatar","version":1,"displayName":"Player avatar",
  "visual":{"size":{"width":9,"height":9},"placeholder":{"shape":"circle","color":1923719},"zIndex":12},
  "colliders":[],"defaultConfig":{},
  "persistence":{"transform":false,"behaviorState":false,"onRoomSleep":"pause"},"complexity":"simple"
}`

const kickableConfigSchemaJSON = `{
  "type":"object",
  "properties":{"sensorId":{"type":"string"},"kickStrength":{"type":"number"},"minImpulse":{"type":"number"},"maxImpulse":{"type":"number"},"cooldownSeconds":{"type":"number"}},
  "required":["sensorId","kickStrength","minImpulse","maxImpulse","cooldownSeconds"],
  "additionalProperties":false
}`

const emptyConfigSchemaJSON = `{"type":"object","additionalProperties":false}`
