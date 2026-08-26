package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

const (
	stampDefinitionPrefix         = "zoomigo-stamp-"
	StampUnavailableReason        = "stamp_unavailable"
	StampInvalidPlacementReason   = "stamp_invalid_placement"
	StampInvalidScaleReason       = "stamp_invalid_scale"
	StampInvalidRotationReason    = "stamp_invalid_rotation"
	StampAlreadyPlacedReason      = "stamp_already_placed"
	StampEditingUnavailableReason = "stamp_editing_unavailable"
)

type StampPlacementZone struct {
	ID     string
	X      float64
	Y      float64
	Radius float64
}

var beachBoardwalkStampZones = []StampPlacementZone{
	{ID: "sand-left", X: 37, Y: 41, Radius: 2.5},
	{ID: "sand-center", X: 45, Y: 60, Radius: 2.5},
	{ID: "shore-right", X: 72, Y: 70, Radius: 2.5},
	{ID: "boardwalk-upper", X: 22, Y: 75, Radius: 2.5},
	{ID: "boardwalk-lower", X: 42, Y: 119, Radius: 2.5},
	{ID: "sand-lower", X: 67, Y: 126, Radius: 2.5},
}

type StampPlacementAuthorizer struct {
	store *SQLiteStore
}

func NewStampPlacementAuthorizer(store *SQLiteStore) StampPlacementAuthorizer {
	return StampPlacementAuthorizer{store: store}
}

func StampDefinitionID(assetID string) string {
	return stampDefinitionPrefix + assetID
}

func BeachBoardwalkStampZones() []StampPlacementZone {
	return append([]StampPlacementZone(nil), beachBoardwalkStampZones...)
}

func (authorizer StampPlacementAuthorizer) AuthorizeDurable(
	ctx context.Context,
	request roomsdk.DurableAuthorizationRequest,
) roomsdk.DurableAuthorizationResult {
	if _, _, err := ParseWeeklyRoomID(request.RoomID); err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if request.Operation == roomsdk.DurableMove || request.Operation == roomsdk.DurableScale || request.Operation == roomsdk.DurableRotate {
		return authorizeStampEdit(request)
	}
	if request.Operation != roomsdk.DurableSpawn || request.Preview {
		return denied(StampEditingUnavailableReason)
	}
	assetID, ok := strings.CutPrefix(request.DefinitionID, stampDefinitionPrefix)
	if !ok || !knownStampAsset(assetID) {
		return denied(StampUnavailableReason)
	}
	if !inStampPlacementZone(request.Position) {
		return denied(StampInvalidPlacementReason)
	}
	for _, item := range request.ExistingItems {
		if item.OwnerUserID == request.UserID && strings.HasPrefix(item.DefinitionID, stampDefinitionPrefix) {
			return denied(StampAlreadyPlacedReason)
		}
	}
	owned, err := authorizer.store.PlayerOwnsCanvasStamp(ctx, request.UserID, assetID)
	if err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
	}
	if !owned {
		return denied(StampUnavailableReason)
	}
	return roomsdk.DurableAuthorizationResult{Allowed: true}
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
			DefinitionID: StampDefinitionID(assetID), Version: 1,
			Complexity:    roomsdk.ItemComplexitySimple,
			ConfigSchema:  json.RawMessage(emptyConfigSchemaJSON),
			DefinitionRaw: stampDefinitionJSON(assetID),
		})
	}
	return records
}

func stampDefinitionJSON(assetID string) json.RawMessage {
	record := map[string]any{
		"definitionId": StampDefinitionID(assetID), "version": 1,
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

func authorizeStampEdit(request roomsdk.DurableAuthorizationRequest) roomsdk.DurableAuthorizationResult {
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
	if request.Operation == roomsdk.DurableMove {
		if !inStampDecoratingArea(request.Position) {
			return denied(StampInvalidPlacementReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
	}
	if request.Operation == roomsdk.DurableRotate {
		if request.Preview || !validStampRotation(request.Rotation) {
			return denied(StampInvalidRotationReason)
		}
		return roomsdk.DurableAuthorizationResult{Allowed: true}
	}
	if request.Preview || !finite(request.Scale) || request.Scale < 0.75 || request.Scale > 1.4 {
		return denied(StampInvalidScaleReason)
	}
	return roomsdk.DurableAuthorizationResult{Allowed: true}
}

func validStampRotation(rotation float64) bool {
	if !finite(rotation) {
		return false
	}
	for _, allowed := range []float64{-math.Pi / 12, 0, math.Pi / 12} {
		if math.Abs(rotation-allowed) <= 0.000001 {
			return true
		}
	}
	return false
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

func inStampPlacementZone(position roomsdk.DurablePosition) bool {
	if !finite(position.X) || !finite(position.Y) {
		return false
	}
	for _, zone := range beachBoardwalkStampZones {
		dx, dy := position.X-zone.X, position.Y-zone.Y
		if dx*dx+dy*dy <= zone.Radius*zone.Radius {
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
