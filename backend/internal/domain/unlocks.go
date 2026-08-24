package domain

type UnlockItemKind string

const (
	UnlockAvatarPart  UnlockItemKind = "avatar_part"
	UnlockCanvasStamp UnlockItemKind = "canvas_stamp"
)

type UnlockItem struct {
	ID             string         `json:"id"`
	Kind           UnlockItemKind `json:"kind"`
	Slot           string         `json:"slot"`
	AssetID        string         `json:"assetId"`
	Label          string         `json:"label"`
	CatalogVersion int            `json:"catalogVersion"`
}

var dailyDropCatalog = []UnlockItem{
	{ID: "avatar-head-dog", Kind: UnlockAvatarPart, Slot: "head", AssetID: "dog", Label: "Rover the dog", CatalogVersion: 1},
	{ID: "avatar-head-cheetah", Kind: UnlockAvatarPart, Slot: "head", AssetID: "cheetah", Label: "Zoomi the cheetah", CatalogVersion: 1},
	{ID: "avatar-head-fox", Kind: UnlockAvatarPart, Slot: "head", AssetID: "fox", Label: "Scout the fox", CatalogVersion: 1},
	{ID: "canvas-stamp-shield", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "shield", Label: "Shield stamp", CatalogVersion: 1},
	{ID: "canvas-stamp-target", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "target", Label: "Target stamp", CatalogVersion: 1},
	{ID: "canvas-stamp-rainbow", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "rainbow", Label: "Rainbow stamp", CatalogVersion: 1},
	{ID: "canvas-stamp-lion", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "lion", Label: "Lion stamp", CatalogVersion: 1},
	{ID: "canvas-stamp-rocket", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "rocket", Label: "Rocket stamp", CatalogVersion: 1},
	{ID: "canvas-stamp-sparkles", Kind: UnlockCanvasStamp, Slot: "stamp", AssetID: "sparkles", Label: "Sparkles stamp", CatalogVersion: 1},
}

var includedCanvasStampAssets = map[string]bool{
	"bolt": true, "fire": true, "star": true, "soccer": true,
	"spark-cleat": true, "zoomigo-mark": true,
}

func DailyDropCatalogItems() []UnlockItem {
	return append([]UnlockItem(nil), dailyDropCatalog...)
}

// SelectDailyDropItem gives each non-empty kind pool equal weight, then picks
// within that pool. Callers provide a server-generated draw; clients never
// choose or reroll it.
func SelectDailyDropItem(owned map[string]bool, draw int) (UnlockItem, bool) {
	avatar := make([]UnlockItem, 0, len(dailyDropCatalog))
	canvas := make([]UnlockItem, 0, len(dailyDropCatalog))
	for _, item := range dailyDropCatalog {
		if owned[item.ID] {
			continue
		}
		if item.Kind == UnlockAvatarPart {
			avatar = append(avatar, item)
		} else {
			canvas = append(canvas, item)
		}
	}
	if len(avatar) == 0 && len(canvas) == 0 {
		return UnlockItem{}, false
	}
	if draw < 0 {
		draw = -(draw + 1)
	}
	pool := avatar
	if draw%2 == 1 {
		pool = canvas
	}
	if len(pool) == 0 {
		if len(avatar) > 0 {
			pool = avatar
		} else {
			pool = canvas
		}
	}
	return pool[(draw/2)%len(pool)], true
}

func DailyDropCatalogItem(itemID string) (UnlockItem, bool) {
	for _, item := range dailyDropCatalog {
		if item.ID == itemID {
			return item, true
		}
	}
	return UnlockItem{}, false
}

func DailyDropAvatarItem(slot, assetID string) (UnlockItem, bool) {
	for _, item := range dailyDropCatalog {
		if item.Kind == UnlockAvatarPart && item.Slot == slot && item.AssetID == assetID {
			return item, true
		}
	}
	return UnlockItem{}, false
}

func DailyDropCanvasItem(assetID string) (UnlockItem, bool) {
	for _, item := range dailyDropCatalog {
		if item.Kind == UnlockCanvasStamp && item.AssetID == assetID {
			return item, true
		}
	}
	return UnlockItem{}, false
}

func CanvasStampIncluded(assetID string) bool {
	return includedCanvasStampAssets[assetID]
}
