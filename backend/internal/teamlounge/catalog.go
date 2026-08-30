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
	BeachBoardwalkCanvasID        = "zoomigo-beach-boardwalk"
	BeachBoardwalkCanvasVersion   = uint32(18)
	BeachBoardwalkRoomGeneration  = BeachBoardwalkCanvasVersion
	loungeVisualLayerDecal        = 4
	loungeVisualLayerGroundEffect = 6
	loungeVisualLayerProp         = 10
	loungeVisualLayerBall         = 20
	loungeVisualLayerAvatar       = 30
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
		ID: "beach-boardwalk", Version: 1, Name: "Beach Boardwalk", RoomGeneration: BeachBoardwalkRoomGeneration,
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

func DurableRoomID(teamID, weekKey string) (string, error) {
	if !validTeamID(teamID) || !validWeekKey(weekKey) {
		return "", errors.New("invalid weekly lounge identity")
	}
	theme, err := WeeklyTheme(weekKey)
	if err != nil {
		return "", err
	}
	return "team:" + teamID + ":lounge:v" + strconv.FormatUint(uint64(theme.RoomGeneration), 10), nil
}

func ParseRoomID(roomID string) (string, error) {
	remainder, ok := strings.CutPrefix(roomID, "team:")
	if !ok {
		return "", errors.New("invalid lounge room")
	}
	teamID, version, ok := strings.Cut(remainder, ":lounge:v")
	if !ok {
		return "", errors.New("invalid lounge room")
	}
	if !validTeamID(teamID) || version != strconv.FormatUint(uint64(BeachBoardwalkRoomGeneration), 10) {
		return "", errors.New("invalid lounge room")
	}
	return teamID, nil
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
				DefinitionID: "beach-ball", Version: 9, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(loungeBallConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(beachBallDefinitionJSON),
			},
			{
				DefinitionID: "avatar", Version: 2, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(avatarDefinitionJSON),
			},
			{
				DefinitionID: "zoomigo-lounge-action-router", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
				ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
				DefinitionRaw: json.RawMessage(loungeActionRouterDefinitionJSON),
			},
		},
	}
	return catalog
}

func BeachBoardwalkLoungeCatalog() Catalog {
	catalog := BeachBoardwalkCatalog()
	for _, assetID := range []string{"bolt", "fire", "star", "soccer", "shield", "target", "rainbow", "lion", "rocket", "sparkles"} {
		catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
			DefinitionID:  "zoomigo-stamp-" + assetID,
			Version:       3,
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
			DefinitionRaw: loungeStampDefinitionJSON(assetID),
		})
	}
	for _, assetID := range []string{"camp-lantern", "pennant-flag", "water-cooler", "training-cone"} {
		catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
			DefinitionID:  "zoomigo-prop-starlight-" + assetID,
			Version:       3,
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
			DefinitionRaw: loungeStaticPropDefinitionJSON(assetID),
		})
	}
	for _, spec := range loungeCompositeItemSpecs {
		catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
			DefinitionID:  "zoomigo-prop-play-" + spec.ID,
			Version:       loungeCompositeVersion(spec),
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(loungeCompositeConfigSchemaJSON),
			DefinitionRaw: loungeCompositeItemDefinitionJSON(spec),
		})
	}
	catalog.Items = append(catalog.Items, roomsdk.ItemDefinitionRecord{
		DefinitionID: "zoomigo-prop-beach-ball", Version: 6,
		Complexity: roomsdk.ItemComplexitySimple, ConfigSchema: json.RawMessage(loungeBallConfigSchemaJSON),
		DefinitionRaw: json.RawMessage(beachBallPropDefinitionJSON),
	})
	return catalog
}

type loungeCompositeItemSpec struct {
	ID          string
	Version     uint32
	DisplayName string
	Width       float64
	Height      float64
	VisualLayer int
	Body        map[string]any
	Colliders   []map[string]any
	Effects     []map[string]any
}

var loungeCompositeItemSpecs = []loungeCompositeItemSpec{
	{
		ID: "boost-pad", DisplayName: "Boost pad", Width: 9, Height: 14,
		VisualLayer: loungeVisualLayerGroundEffect,
		Body:        loungeFixedBody(), Colliders: []map[string]any{loungeSensorRect("zone", 7, 12)},
		Effects: []map[string]any{
			{"kind": "boost", "sensorId": "zone", "speed": 18, "directionRadians": -1.5707963267948966},
			{"kind": "hop", "sensorId": "zone", "elevationSpeed": 5},
		},
	},
	{
		ID: "bounce-drum", DisplayName: "Bounce drum", Width: 12, Height: 12,
		Body: loungeDynamicBody(7, 0.7), Colliders: []map[string]any{
			loungeSolidCircle("solid", 5), loungeSensorCircle("bumper", 6),
		},
		Effects: []map[string]any{
			{"kind": "bounce", "sensorId": "bumper", "impulse": 15},
			{"kind": "wobble", "sensorId": "bumper", "torque": 420},
		},
	},
	{
		ID: "pinwheel", DisplayName: "Pinwheel", Width: 11, Height: 11,
		Body: loungeKinematicBody(), Colliders: []map[string]any{loungeSensorCircle("air", 6.5)},
		Effects: []map[string]any{
			{"kind": "spin", "angularVelocity": 2.8},
			{"kind": "push", "sensorId": "air", "force": 6},
		},
	},
	{
		ID: "orbit-beacon", DisplayName: "Orbit beacon", Width: 11, Height: 11,
		Body: loungeKinematicBody(), Colliders: []map[string]any{loungeSensorCircle("field", 10)},
		Effects: []map[string]any{
			{"kind": "spin", "angularVelocity": 1.2},
			{"kind": "orbit", "sensorId": "field", "radialForce": 5, "tangentialForce": 8, "maxForce": 9.5},
		},
	},
	{
		ID: "breeze-fan", DisplayName: "Breeze fan", Width: 12, Height: 11,
		Body: loungeKinematicBody(), Colliders: []map[string]any{
			loungeOffsetCollider(loungeSensorRect("air", 15, 7), 7.5, 0),
		},
		Effects: []map[string]any{
			{"kind": "spin", "angularVelocity": 4.2},
			{"kind": "push", "sensorId": "air", "force": 13},
		},
	},
	{
		ID: "soft-sand-mat", DisplayName: "Soft sand mat", Width: 16, Height: 10,
		VisualLayer: loungeVisualLayerGroundEffect,
		Body:        loungeFixedBody(), Colliders: []map[string]any{loungeSensorRect("surface", 14, 8)},
		Effects: []map[string]any{
			{"kind": "dampen", "sensorId": "surface", "linearFactor": 0.88, "angularFactor": 0.8, "minimumSpeed": 0.75},
			{"kind": "orbit", "sensorId": "surface", "radialForce": 2, "tangentialForce": 0, "maxForce": 2},
		},
	},
	{
		ID: "speed-lane", DisplayName: "Speed lane", Width: 18, Height: 6,
		VisualLayer: loungeVisualLayerGroundEffect,
		Body:        loungeFixedBody(), Colliders: []map[string]any{loungeSensorRect("lane", 17, 5)},
		Effects: []map[string]any{
			{"kind": "boost", "sensorId": "lane", "speed": 22},
			{"kind": "push", "sensorId": "lane", "force": 5},
		},
	},
	{
		ID: "wobble-cone", DisplayName: "Wobble cone", Width: 9, Height: 11,
		Body: loungeDynamicBody(4, 0.4), Colliders: []map[string]any{
			loungeSolidCircle("solid", 3.8), loungeSensorCircle("bumper", 5),
		},
		Effects: []map[string]any{
			{"kind": "bounce", "sensorId": "bumper", "impulse": 7},
			{"kind": "wobble", "sensorId": "bumper", "torque": 780},
		},
	},
	{
		ID: "swing-gate", DisplayName: "Swing gate", Width: 18, Height: 9,
		Body: loungeKinematicBody(), Colliders: []map[string]any{
			loungeSolidRect("bar", 14, 2.5), loungeSensorRect("bumper", 15, 4),
		},
		Effects: []map[string]any{
			{"kind": "swing", "amplitudeRadians": 0.7, "periodSeconds": 3},
			{"kind": "bounce", "sensorId": "bumper", "impulse": 6},
		},
	},
	{
		ID: "mini-goal", Version: 5, DisplayName: "Mini goal", Width: 18, Height: 11,
		Body: loungeFixedBody(), Colliders: []map[string]any{
			loungeOffsetCollider(loungeSolidRect("left-post", 2, 10), -7.5, 0),
			loungeOffsetCollider(loungeSolidRect("right-post", 2, 10), 7.5, 0),
			loungeOffsetCollider(loungeSolidRect("back-bar", 15, 2), 0, -4.5),
			loungeOffsetCollider(loungeSensorRect("mouth", 11, 2), 0, -2.5),
		},
		Effects: []map[string]any{
			{"kind": "dampen", "sensorId": "mouth", "acceptedDefinitionIds": []string{"beach-ball", "zoomigo-prop-beach-ball"}, "linearFactor": 0.7, "angularFactor": 0.7, "minimumSpeed": 0.5},
			{"kind": "goal", "sensorId": "mouth", "acceptedDefinitionIds": []string{"beach-ball", "zoomigo-prop-beach-ball"}, "holdSeconds": 0.4, "ejectOffset": map[string]float64{"x": 0, "y": 8}, "ejectSpeed": 18, "cooldownSeconds": 1},
		},
	},
	{
		ID: "ball-cannon", Version: 2, DisplayName: "Ball cannon", Width: 18, Height: 10.5,
		Body: loungeFixedBody(), Colliders: []map[string]any{
			loungeOffsetCollider(loungeSensorRect("intake", 4, 7), -7, 0),
			loungeOffsetCollider(loungeSolidRect("front-stop", 2, 8), 4, 0),
		},
		Effects: []map[string]any{
			{"kind": "dampen", "sensorId": "intake", "acceptedDefinitionIds": []string{"beach-ball", "zoomigo-prop-beach-ball"}, "linearFactor": 0, "angularFactor": 0, "minimumSpeed": 0},
			{"kind": "cannon", "sensorId": "intake", "acceptedDefinitionIds": []string{"beach-ball", "zoomigo-prop-beach-ball"}, "exitOffset": map[string]float64{"x": 10, "y": 0}, "speed": 50, "dwellSeconds": 0.8, "cooldownSeconds": 0.75},
		},
	},
}

func loungeCompositeVersion(spec loungeCompositeItemSpec) uint32 {
	if spec.Version > 0 {
		return spec.Version
	}
	return 3
}

func loungeCompositeItemDefinitionJSON(spec loungeCompositeItemSpec) json.RawMessage {
	raw, err := json.Marshal(map[string]any{
		"definitionId": "zoomigo-prop-play-" + spec.ID,
		"version":      loungeCompositeVersion(spec),
		"displayName":  spec.DisplayName,
		"visual": map[string]any{
			"size":     map[string]float64{"width": spec.Width, "height": spec.Height},
			"spriteId": "lounge.stamp.transparent", "zIndex": loungeCompositeVisualLayer(spec),
		},
		"body": spec.Body, "colliders": spec.Colliders,
		"behaviorType":  "zoomigoLoungeComposite",
		"defaultConfig": map[string]any{"effects": spec.Effects},
		"persistence":   map[string]any{"transform": true, "behaviorState": true, "onRoomSleep": "pause"},
		"complexity":    "simple",
	})
	if err != nil {
		panic(err)
	}
	return raw
}

func loungeCompositeVisualLayer(spec loungeCompositeItemSpec) int {
	if spec.VisualLayer != 0 {
		return spec.VisualLayer
	}
	return loungeVisualLayerProp
}

func loungeFixedBody() map[string]any {
	return map[string]any{"mode": "fixed"}
}

func loungeKinematicBody() map[string]any {
	return map[string]any{"mode": "kinematicVelocity", "gravityScale": 0, "canSleep": false}
}

func loungeDynamicBody(mass, angularDamping float64) map[string]any {
	return map[string]any{
		"mode": "dynamic", "mass": mass, "gravityScale": 0,
		"linearDamping": 0.4, "angularDamping": angularDamping, "canSleep": true,
	}
}

func loungeSensorRect(id string, width, height float64) map[string]any {
	return map[string]any{"id": id, "role": "itemSensor", "shape": map[string]any{"type": "rect", "width": width, "height": height}}
}

func loungeSensorCircle(id string, radius float64) map[string]any {
	return map[string]any{"id": id, "role": "itemSensor", "shape": map[string]any{"type": "circle", "radius": radius}}
}

func loungeSolidRect(id string, width, height float64) map[string]any {
	return map[string]any{
		"id": id, "role": "itemSolid", "shape": map[string]any{"type": "rect", "width": width, "height": height},
		"collisionMask": 12, "restitution": 0.75, "friction": 0.15,
	}
}

func loungeSolidCircle(id string, radius float64) map[string]any {
	return map[string]any{
		"id": id, "role": "itemSolid", "shape": map[string]any{"type": "circle", "radius": radius},
		"collisionMask": 12, "restitution": 0.8, "friction": 0.12,
	}
}

func loungeOffsetCollider(collider map[string]any, x, y float64) map[string]any {
	collider["offset"] = map[string]float64{"x": x, "y": y}
	return collider
}

func loungeStaticPropDefinitionJSON(assetID string) json.RawMessage {
	raw, err := json.Marshal(map[string]any{
		"definitionId": "zoomigo-prop-starlight-" + assetID,
		"version":      3,
		"displayName":  strings.ReplaceAll(assetID, "-", " "),
		"visual": map[string]any{
			"size": map[string]float64{"width": 10, "height": 10}, "spriteId": "lounge.stamp.transparent", "zIndex": loungeVisualLayerDecal,
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

func loungeStampDefinitionJSON(assetID string) json.RawMessage {
	raw, err := json.Marshal(map[string]any{
		"definitionId": "zoomigo-stamp-" + assetID,
		"version":      3,
		"displayName":  assetID + " stamp",
		"visual": map[string]any{
			"size": map[string]float64{"width": 10, "height": 10}, "spriteId": "lounge.stamp.transparent", "zIndex": loungeVisualLayerDecal,
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
  "id":"zoomigo-beach-boardwalk","version":18,
  "size":{"width":100,"height":150},"orientation":"topDown",
  "backgroundAssetId":"lounge.background",
  "edges":{"top":"open","right":"open","bottom":"open","left":"open"},
  "staticGeometry":[
    {"id":"elastic-edge-top","shape":{"type":"rect","width":104,"height":2},"position":{"x":50,"y":-1},"restitution":1,"friction":0,"tags":["elastic-edge"],"blocks":{"avatars":true,"items":true}},
    {"id":"elastic-edge-right","shape":{"type":"rect","width":2,"height":154},"position":{"x":101,"y":75},"restitution":1,"friction":0,"tags":["elastic-edge"],"blocks":{"avatars":true,"items":true}},
    {"id":"elastic-edge-bottom","shape":{"type":"rect","width":104,"height":2},"position":{"x":50,"y":151},"restitution":1,"friction":0,"tags":["elastic-edge"],"blocks":{"avatars":true,"items":true}},
    {"id":"elastic-edge-left","shape":{"type":"rect","width":2,"height":154},"position":{"x":-1,"y":75},"restitution":1,"friction":0,"tags":["elastic-edge"],"blocks":{"avatars":true,"items":true}}
  ],
  "regions":[],
  "environment":{"base":{"gravityXY":{"x":0,"y":0},"linearDrag":0.03,"angularDrag":0.06,"softSpeedLimit":40,"surfaceFrictionMultiplier":1}},
  "spawnPoints":[{"id":"arrival","position":{"x":43,"y":92}}],
  "systemItems":[{"entityId":"boardwalk-beach-ball","definitionId":"beach-ball","definitionVersion":9,"transform":{"x":62,"y":98,"rotation":0,"scale":1},"resolvedConfig":{"sensorId":"kick","minKickSpeed":2.5,"kickExponent":1.35,"kickStrength":3,"pinchStrength":2.8,"maxImpulse":48,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16}},{"entityId":"lounge-action-router","definitionId":"zoomigo-lounge-action-router","definitionVersion":1,"transform":{"x":0,"y":0,"rotation":0,"scale":1},"resolvedConfig":{}}],
  "limits":{"maxAvatars":24,"maxItems":169,"maxComplexPhysicsItems":4},
  "avatarController":{"radius":4,"maxSpeed":26,"acceleration":125,"flickDeceleration":42,"maxTurnSpeed":9,"facing":"fixed","directInteractionMaxSpeed":32},
  "terrainDefaults":{"avatars":true,"items":true}
}`

const beachBallPropDefinitionJSON = `{
  "definitionId":"zoomigo-prop-beach-ball","version":6,"displayName":"Beach ball prop",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.stamp.transparent","placeholder":{"shape":"circle","color":16765757},"zIndex":20},
  "body":{"mode":"dynamic","mass":0.5,"gravityScale":0,"linearDamping":0.05,"angularDamping":0.08,"canSleep":true},
  "colliders":[
    {"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.95,"friction":0.05,"collisionMask":28,"tags":["lounge-ball"]},
    {"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}
  ],
  "behaviorType":"zoomigoLoungeBall","defaultConfig":{"sensorId":"kick","minKickSpeed":2.5,"kickExponent":1.35,"kickStrength":3,"pinchStrength":2.8,"maxImpulse":48,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`

const beachBallDefinitionJSON = `{
  "definitionId":"beach-ball","version":9,"displayName":"Beach ball",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.ball","placeholder":{"shape":"circle","color":16765757},"zIndex":20},
  "body":{"mode":"dynamic","mass":0.5,"gravityScale":0,"linearDamping":0.05,"angularDamping":0.08,"canSleep":true},
  "colliders":[
    {"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.95,"friction":0.05,"collisionMask":28,"tags":["lounge-ball"]},
    {"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}
  ],
  "behaviorType":"zoomigoLoungeBall","defaultConfig":{"sensorId":"kick","minKickSpeed":2.5,"kickExponent":1.35,"kickStrength":3,"pinchStrength":2.8,"maxImpulse":48,"tangentialStrength":0.48,"maxTangentialImpulse":8,"spinTransfer":1,"spinRadius":4.5,"maxAngularSpeed":15,"cooldownSeconds":0.16},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`

const avatarDefinitionJSON = `{
  "definitionId":"avatar","version":2,"displayName":"Player avatar",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.stamp.transparent","placeholder":{"shape":"circle","color":1923719},"zIndex":30},
  "colliders":[],"defaultConfig":{},
  "persistence":{"transform":false,"behaviorState":false,"onRoomSleep":"pause"},"complexity":"simple"
}`

const loungeActionRouterDefinitionJSON = `{
  "definitionId":"zoomigo-lounge-action-router","version":1,"displayName":"Lounge action router",
  "visual":{"size":{"width":0.1,"height":0.1},"spriteId":"lounge.stamp.transparent","zIndex":0},
  "colliders":[],"behaviorType":"zoomigoLoungeActions","defaultConfig":{},
  "persistence":{"transform":false,"behaviorState":false,"onRoomSleep":"pause"},"complexity":"simple"
}`

const loungeBallConfigSchemaJSON = `{
  "type":"object",
  "properties":{"sensorId":{"type":"string"},"minKickSpeed":{"type":"number"},"kickExponent":{"type":"number"},"kickStrength":{"type":"number"},"pinchStrength":{"type":"number"},"maxImpulse":{"type":"number"},"tangentialStrength":{"type":"number"},"maxTangentialImpulse":{"type":"number"},"spinTransfer":{"type":"number"},"spinRadius":{"type":"number"},"maxAngularSpeed":{"type":"number"},"cooldownSeconds":{"type":"number"}},
  "required":["sensorId","minKickSpeed","kickExponent","kickStrength","pinchStrength","maxImpulse","tangentialStrength","maxTangentialImpulse","spinTransfer","spinRadius","maxAngularSpeed","cooldownSeconds"],
  "additionalProperties":false
}`

const loungeCompositeConfigSchemaJSON = `{
  "type":"object",
  "properties":{"effects":{"type":"array","minItems":2,"maxItems":4,"items":{"type":"object","properties":{"kind":{"type":"string","enum":["boost","hop","bounce","wobble","spin","push","orbit","dampen","swing","goal","cannon"]}},"required":["kind"],"additionalProperties":true}}},
  "required":["effects"],"additionalProperties":false
}`

const emptyConfigSchemaJSON = `{"type":"object","additionalProperties":false}`
