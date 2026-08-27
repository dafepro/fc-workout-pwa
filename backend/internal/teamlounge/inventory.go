package teamlounge

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

type PlaceableStamp struct {
	AssetID  string `json:"assetId"`
	Label    string `json:"label"`
	Source   string `json:"source"`
	UnlockID string `json:"unlockId,omitempty"`
	IsNew    bool   `json:"isNew"`
}

type PlaceableProp struct {
	AssetID  string `json:"assetId"`
	Label    string `json:"label"`
	UnlockID string `json:"unlockId"`
	IsNew    bool   `json:"isNew"`
}

var includedStampLabels = map[string]string{
	"bolt":         "Bolt",
	"fire":         "Fire",
	"star":         "Star",
	"soccer":       "Soccer ball",
	"spark-cleat":  "Spark cleat",
	"zoomigo-mark": "ZoomiGo mark",
}

func (store *SQLiteStore) PlaceableStamps(ctx context.Context, playerID string) ([]PlaceableStamp, error) {
	if playerID == "" {
		return nil, fmt.Errorf("list placeable lounge stamps: invalid player")
	}
	stamps := make([]PlaceableStamp, 0, len(stampAssetIDs()))
	for _, assetID := range domain.IncludedCanvasStampAssets() {
		label, ok := includedStampLabels[assetID]
		if !ok {
			return nil, fmt.Errorf("list placeable lounge stamps: included catalog is incomplete")
		}
		stamps = append(stamps, PlaceableStamp{
			AssetID: assetID,
			Label:   label,
			Source:  "included",
		})
	}

	rows, err := store.db.QueryContext(ctx, `SELECT item_id, viewed_at
		FROM player_unlocks
		WHERE player_id = ? AND item_kind = 'canvas_stamp'
		ORDER BY unlocked_at, item_id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list placeable lounge stamps: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var itemID string
		var viewedAt sql.NullString
		if err := rows.Scan(&itemID, &viewedAt); err != nil {
			return nil, fmt.Errorf("scan placeable lounge stamp: %w", err)
		}
		item, ok := domain.DailyDropCatalogItem(itemID)
		if !ok || item.Kind != domain.UnlockCanvasStamp || !knownStampAsset(item.AssetID) {
			continue
		}
		stamps = append(stamps, PlaceableStamp{
			AssetID:  item.AssetID,
			Label:    item.Label,
			Source:   "earned",
			UnlockID: item.ID,
			IsNew:    !viewedAt.Valid,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read placeable lounge stamps: %w", err)
	}
	return stamps, nil
}

func (store *SQLiteStore) PlaceableProps(ctx context.Context, playerID string) ([]PlaceableProp, error) {
	if playerID == "" {
		return nil, fmt.Errorf("list placeable lounge props: invalid player")
	}
	rows, err := store.db.QueryContext(ctx, `SELECT item_id, viewed_at
		FROM player_unlocks
		WHERE player_id = ? AND item_kind = 'canvas_prop'
		ORDER BY unlocked_at, item_id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list placeable lounge props: %w", err)
	}
	defer rows.Close()
	props := []PlaceableProp{}
	for rows.Next() {
		var itemID string
		var viewedAt sql.NullString
		if err := rows.Scan(&itemID, &viewedAt); err != nil {
			return nil, fmt.Errorf("scan placeable lounge prop: %w", err)
		}
		item, ok := domain.DailyDropCatalogItem(itemID)
		if !ok || item.Kind != domain.UnlockCanvasProp || !knownPropAsset(item.AssetID) {
			continue
		}
		props = append(props, PlaceableProp{
			AssetID: item.AssetID, Label: item.Label, UnlockID: item.ID, IsNew: !viewedAt.Valid,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read placeable lounge props: %w", err)
	}
	return props, nil
}
