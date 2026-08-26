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
	StampUnavailableReason              = "stamp_unavailable"
	StampInvalidPlacementReason         = "stamp_invalid_placement"
	StampInvalidScaleReason             = "stamp_invalid_scale"
	StampInvalidRotationReason          = "stamp_invalid_rotation"
	StampPlacementBudgetExhaustedReason = "stamp_budget_exhausted"
	StampLockedReason                   = "stamp_locked"
	StampEditingUnavailableReason       = "stamp_editing_unavailable"
	stampPlacementConfigSchemaJSON      = `{"type":"object","properties":{"placementDay":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"additionalProperties":false}`
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

func (authorizer StampPlacementAuthorizer) AuthorizeDurable(
	ctx context.Context,
	request roomsdk.DurableAuthorizationRequest,
) roomsdk.DurableAuthorizationResult {
	if authorizer.store == nil || authorizer.now == nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if request.Operation == roomsdk.DurableMove || request.Operation == roomsdk.DurableScale || request.Operation == roomsdk.DurableRotate {
		dayKey, err := authorizer.store.PlacementDay(ctx, request.RoomID, authorizer.now().UTC())
		if err != nil {
			return denied(roomsdk.DurableRejectedByApplication)
		}
		return authorizeStampEdit(request, dayKey)
	}
	if request.Operation != roomsdk.DurableSpawn || request.Preview {
		return denied(StampEditingUnavailableReason)
	}
	assetID, ok := strings.CutPrefix(request.DefinitionID, stampDefinitionPrefix)
	if !ok || !knownStampAsset(assetID) {
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
		if item.OwnerUserID == request.UserID && strings.HasPrefix(item.DefinitionID, stampDefinitionPrefix) {
			used++
		}
	}
	if used >= earned {
		return denied(StampPlacementBudgetExhaustedReason)
	}
	owned, err := authorizer.store.PlayerOwnsCanvasStamp(ctx, request.UserID, assetID)
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if !owned {
		return denied(StampUnavailableReason)
	}
	config, err := json.Marshal(struct {
		PlacementDay string `json:"placementDay"`
	}{PlacementDay: budget.DayKey})
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	return roomsdk.DurableAuthorizationResult{Allowed: true, CanonicalConfig: config}
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

func authorizeStampEdit(request roomsdk.DurableAuthorizationRequest, dayKey string) roomsdk.DurableAuthorizationResult {
	var owned *roomsdk.DurableAuthorizationItem
	for index := range request.ExistingItems {
		item := &request.ExistingItems[index]
		if item.EntityID == request.EntityID &&
			item.OwnerUserID == request.UserID &&
			strings.HasPrefix(item.DefinitionID, stampDefinitionPrefix) {
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
	if request.Operation == roomsdk.DurableMove {
		if !inStampDecoratingArea(request.Position) {
			return denied(StampInvalidPlacementReason)
		}
		if !validStampScale(request.Scale) {
			return denied(StampInvalidScaleReason)
		}
		if !validStampRotation(request.Rotation) {
			return denied(StampInvalidRotationReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
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

func validStampRotation(rotation float64) bool {
	if !finite(rotation) || rotation < -math.Pi-0.000001 || rotation >= math.Pi-0.000001 {
		return false
	}
	step := math.Pi / 12
	return math.Abs(rotation-math.Round(rotation/step)*step) <= 0.000001
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
