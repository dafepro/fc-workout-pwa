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
	if request.Operation != roomsdk.DurableSpawn || request.Preview {
		return denied(StampEditingUnavailableReason)
	}
	if _, _, err := ParseWeeklyRoomID(request.RoomID); err != nil {
		return denied(roomsdk.DurableRejectedByApplication)
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
	if math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) {
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

func denied(reason string) roomsdk.DurableAuthorizationResult {
	return roomsdk.DurableAuthorizationResult{Reason: reason}
}
