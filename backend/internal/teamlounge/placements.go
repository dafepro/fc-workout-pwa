package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

const (
	stampDefinitionPrefix               = "zoomigo-stamp-"
	propDefinitionPrefix                = "zoomigo-prop-"
	StampUnavailableReason              = "stamp_unavailable"
	StampInvalidPlacementReason         = "stamp_invalid_placement"
	StampInvalidScaleReason             = "stamp_invalid_scale"
	StampInvalidRotationReason          = "stamp_invalid_rotation"
	StampPlacementBudgetExhaustedReason = "stamp_budget_exhausted"
	StampLockedReason                   = "stamp_locked"
	StampEditingUnavailableReason       = "stamp_editing_unavailable"
	stampPlacementConfigSchemaJSON      = `{"type":"object","properties":{"placementDay":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"additionalProperties":false}`
	propPlacementConfigSchemaJSON       = `{"type":"object","properties":{"placementDay":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"sensorId":{"type":"string"},"kickStrength":{"type":"number"},"minImpulse":{"type":"number"},"maxImpulse":{"type":"number"},"cooldownSeconds":{"type":"number"}},"required":["placementDay","sensorId","kickStrength","minImpulse","maxImpulse","cooldownSeconds"],"additionalProperties":false}`
)

type StampPlacementAuthorizer struct {
	store          *SQLiteStore
	now            func() time.Time
	minimumCredits int
}

func NewStampPlacementAuthorizer(store *SQLiteStore, now func() time.Time, minimumCredits ...int) StampPlacementAuthorizer {
	minimum := 0
	if len(minimumCredits) == 1 && minimumCredits[0] > 0 {
		minimum = minimumCredits[0]
	}
	return StampPlacementAuthorizer{store: store, now: now, minimumCredits: minimum}
}

func StampDefinitionID(assetID string) string {
	return stampDefinitionPrefix + assetID
}

func PropDefinitionID(assetID string) string {
	return propDefinitionPrefix + assetID
}

func (authorizer StampPlacementAuthorizer) AuthorizeDurable(
	ctx context.Context,
	request roomsdk.DurableAuthorizationRequest,
) roomsdk.DurableAuthorizationResult {
	if authorizer.store == nil || authorizer.now == nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if request.Operation == roomsdk.DurableMove || request.Operation == roomsdk.DurableScale || request.Operation == roomsdk.DurableRotate || request.Operation == roomsdk.DurableDelete {
		dayKey, err := authorizer.store.PlacementDay(ctx, request.RoomID, authorizer.now().UTC())
		if err != nil {
			return denied(roomsdk.DurableRejectedByApplication)
		}
		return authorizePlaceableEdit(request, dayKey)
	}
	if request.Operation != roomsdk.DurableSpawn || request.Preview {
		return denied(StampEditingUnavailableReason)
	}
	kind, assetID, ok := placeableDefinition(request.DefinitionID)
	if !ok {
		return denied(StampUnavailableReason)
	}
	if !inStampDecoratingArea(request.Position) {
		return denied(StampInvalidPlacementReason)
	}
	budget, err := authorizer.store.PlacementBudget(ctx, request.RoomID, request.UserID, authorizer.now().UTC())
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	earned := max(budget.Earned, authorizer.minimumCredits)
	used := 0
	for _, item := range request.ExistingItems {
		if item.OwnerUserID == request.UserID && isPlaceableDefinition(item.DefinitionID) {
			used++
		}
	}
	if used >= earned {
		return denied(StampPlacementBudgetExhaustedReason)
	}
	owned, err := authorizer.store.playerOwnsPlaceable(ctx, request.UserID, kind, assetID)
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if !owned {
		return denied(StampUnavailableReason)
	}
	config, err := placementConfig(kind, budget.DayKey)
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	return roomsdk.DurableAuthorizationResult{Allowed: true, CanonicalConfig: config}
}

func placementConfig(kind domain.UnlockItemKind, day string) (json.RawMessage, error) {
	if kind == domain.UnlockCanvasProp {
		return json.Marshal(struct {
			PlacementDay   string  `json:"placementDay"`
			SensorID       string  `json:"sensorId"`
			KickStrength   float64 `json:"kickStrength"`
			MinImpulse     float64 `json:"minImpulse"`
			MaxImpulse     float64 `json:"maxImpulse"`
			CooldownSecond float64 `json:"cooldownSeconds"`
		}{day, "kick", 1.25, 2.5, 18, 0.25})
	}
	return json.Marshal(struct {
		PlacementDay string `json:"placementDay"`
	}{PlacementDay: day})
}

func (store *SQLiteStore) playerOwnsPlaceable(ctx context.Context, playerID string, kind domain.UnlockItemKind, assetID string) (bool, error) {
	if kind == domain.UnlockCanvasStamp {
		return store.PlayerOwnsCanvasStamp(ctx, playerID, assetID)
	}
	if playerID == "" || kind != domain.UnlockCanvasProp || !knownPropAsset(assetID) {
		return false, nil
	}
	item, ok := domain.DailyDropCanvasPropItem(assetID)
	if !ok {
		return false, nil
	}
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM player_unlocks
		WHERE player_id = ? AND item_kind = 'canvas_prop' AND item_id = ?`, playerID, item.ID).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return marker == 1, nil
}

func (store *SQLiteStore) PlayerOwnsCanvasStamp(ctx context.Context, playerID, assetID string) (bool, error) {
	if playerID == "" || !knownStampAsset(assetID) {
		return false, nil
	}
	if domain.CanvasStampIncluded(assetID) {
		return true, nil
	}
	item, ok := domain.DailyDropCanvasItem(assetID)
	if !ok {
		return false, nil
	}
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM player_unlocks
		WHERE player_id = ? AND item_kind = 'canvas_stamp' AND item_id = ?`, playerID, item.ID).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return marker == 1, nil
}

func stampDefinitionRecords() []roomsdk.ItemDefinitionRecord {
	records := make([]roomsdk.ItemDefinitionRecord, 0, len(stampAssetIDs()))
	for _, assetID := range stampAssetIDs() {
		records = append(records, roomsdk.ItemDefinitionRecord{
			DefinitionID: StampDefinitionID(assetID), Version: 2,
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(stampPlacementConfigSchemaJSON),
			DefinitionRaw: stampDefinitionJSON(assetID),
		})
	}
	return records
}

func propDefinitionRecords() []roomsdk.ItemDefinitionRecord {
	return []roomsdk.ItemDefinitionRecord{{
		DefinitionID: PropDefinitionID("beach-ball"), Version: 1,
		Complexity:    roomsdk.ItemComplexitySimple,
		ConfigSchema:  json.RawMessage(propPlacementConfigSchemaJSON),
		DefinitionRaw: propDefinitionJSON(),
	}}
}

func propDefinitionJSON() json.RawMessage {
	return json.RawMessage(`{
  "definitionId":"zoomigo-prop-beach-ball","version":1,"displayName":"Beach ball prop",
  "visual":{"size":{"width":9,"height":9},"spriteId":"lounge.stamp.transparent","placeholder":{"shape":"circle","color":16765757},"zIndex":8},
  "body":{"mode":"dynamic","mass":0.35,"gravityScale":0,"linearDamping":0.4,"angularDamping":0.55,"canSleep":true},
  "colliders":[{"id":"solid","role":"itemSolid","shape":{"type":"circle","radius":4.5},"restitution":0.82,"friction":0.18,"collisionMask":31},{"id":"kick","role":"itemSensor","shape":{"type":"circle","radius":5.8}}],
  "behaviorType":"kickable","defaultConfig":{"sensorId":"kick","kickStrength":1.25,"minImpulse":2.5,"maxImpulse":18,"cooldownSeconds":0.25},
  "persistence":{"transform":true,"behaviorState":true,"onRoomSleep":"pause"},"complexity":"simple"
}`)
}

func stampDefinitionJSON(assetID string) json.RawMessage {
	record := map[string]any{
		"definitionId": StampDefinitionID(assetID), "version": 2,
		"displayName": assetID + " stamp",
		"visual": map[string]any{
			"size":        map[string]float64{"width": 10, "height": 10},
			"spriteId":    "lounge.stamp.transparent",
			"placeholder": map[string]any{"shape": "circle", "color": 13234973},
			"zIndex":      9,
		},
		"colliders": []any{}, "defaultConfig": map[string]any{},
		"persistence": map[string]any{"transform": true, "behaviorState": false, "onRoomSleep": "pause"},
		"complexity":  "simple",
	}
	raw, err := json.Marshal(record)
	if err != nil {
		panic(err)
	}
	return raw
}

func authorizePlaceableEdit(request roomsdk.DurableAuthorizationRequest, dayKey string) roomsdk.DurableAuthorizationResult {
	var owned *roomsdk.DurableAuthorizationItem
	for index := range request.ExistingItems {
		item := &request.ExistingItems[index]
		if item.EntityID == request.EntityID &&
			item.OwnerUserID == request.UserID &&
			isPlaceableDefinition(item.DefinitionID) {
			owned = item
			break
		}
	}
	if owned == nil {
		return denied(StampEditingUnavailableReason)
	}
	var metadata struct {
		PlacementDay string `json:"placementDay"`
	}
	if json.Unmarshal(owned.ResolvedConfig, &metadata) != nil || metadata.PlacementDay != dayKey {
		return denied(StampLockedReason)
	}
	if request.Operation == roomsdk.DurableDelete {
		if request.Preview {
			return denied(StampEditingUnavailableReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
	}
	_, _, prop := placeableDefinition(owned.DefinitionID)
	isProp := prop && strings.HasPrefix(owned.DefinitionID, propDefinitionPrefix)
	if request.Operation == roomsdk.DurableMove {
		if !inStampDecoratingArea(request.Position) {
			return denied(StampInvalidPlacementReason)
		}
		if (isProp && request.Scale != 1) || (!isProp && !validStampScale(request.Scale)) {
			return denied(StampInvalidScaleReason)
		}
		if (isProp && !finite(request.Rotation)) || (!isProp && !validStampRotation(request.Rotation)) {
			return denied(StampInvalidRotationReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
	}
	if isProp {
		return denied(StampEditingUnavailableReason)
	}
	if request.Operation == roomsdk.DurableRotate {
		if request.Preview || !validStampRotation(request.Rotation) {
			return denied(StampInvalidRotationReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
	}
	if request.Preview || !validStampScale(request.Scale) {
		return denied(StampInvalidScaleReason)
	}
	return roomsdk.DurableAuthorizationResult{Allowed: true}
}

func placeableDefinition(definitionID string) (domain.UnlockItemKind, string, bool) {
	if assetID, ok := strings.CutPrefix(definitionID, stampDefinitionPrefix); ok && knownStampAsset(assetID) {
		return domain.UnlockCanvasStamp, assetID, true
	}
	if assetID, ok := strings.CutPrefix(definitionID, propDefinitionPrefix); ok && knownPropAsset(assetID) {
		return domain.UnlockCanvasProp, assetID, true
	}
	return "", "", false
}

func isPlaceableDefinition(definitionID string) bool {
	_, _, ok := placeableDefinition(definitionID)
	return ok
}

func knownPropAsset(assetID string) bool {
	return assetID == "beach-ball"
}

func validStampRotation(rotation float64) bool {
	if !finite(rotation) {
		return false
	}
	step := math.Pi / 12
	stepIndex := math.Round(rotation / step)
	if stepIndex < -12 || stepIndex >= 12 {
		return false
	}
	// Canvas snapshots carry radians at 0.001 precision before the next move.
	return math.Abs(rotation-stepIndex*step) <= 0.000501
}

func validStampScale(scale float64) bool {
	return finite(scale) && scale >= 0.75 && scale <= 1.4
}

func stampAssetIDs() []string {
	assetIDs := domain.IncludedCanvasStampAssets()
	for _, item := range domain.DailyDropCatalogItems() {
		if item.Kind == domain.UnlockCanvasStamp {
			assetIDs = append(assetIDs, item.AssetID)
		}
	}
	return assetIDs
}

func knownStampAsset(assetID string) bool {
	for _, candidate := range stampAssetIDs() {
		if candidate == assetID {
			return true
		}
	}
	return false
}

func inStampDecoratingArea(position roomsdk.DurablePosition) bool {
	return finite(position.X) && finite(position.Y) && position.X >= 5 && position.X <= 95 && position.Y >= 5 && position.Y <= 145
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func denied(reason string) roomsdk.DurableAuthorizationResult {
	return roomsdk.DurableAuthorizationResult{Reason: reason}
}
