package domain_test

import (
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestDailyDropCatalogUsesStableAvatarAndLoungeItems(t *testing.T) {
	items := domain.DailyDropCatalogItems()
	if len(items) < 2 {
		t.Fatalf("catalog has %d items, want both reward kinds", len(items))
	}
	kinds := map[domain.UnlockItemKind]bool{}
	ids := map[string]bool{}
	for _, item := range items {
		if item.ID == "" || item.AssetID == "" || item.Label == "" || item.CatalogVersion != 1 ||
			item.Rarity == "" || item.Destination == "" {
			t.Fatalf("invalid catalog item: %+v", item)
		}
		if item.Kind == domain.UnlockAvatarPart && item.Destination != domain.UnlockDestinationAvatar {
			t.Fatalf("avatar item destination = %q", item.Destination)
		}
		if item.Kind == domain.UnlockCanvasStamp && item.Destination != domain.UnlockDestinationTeamLounge {
			t.Fatalf("canvas item destination = %q", item.Destination)
		}
		if item.Kind == domain.UnlockCanvasProp && item.Destination != domain.UnlockDestinationTeamLounge {
			t.Fatalf("prop destination = %q", item.Destination)
		}
		if ids[item.ID] {
			t.Fatalf("duplicate catalog id: %s", item.ID)
		}
		ids[item.ID] = true
		kinds[item.Kind] = true
	}
	if !kinds[domain.UnlockAvatarPart] || !kinds[domain.UnlockCanvasStamp] || !kinds[domain.UnlockCanvasProp] {
		t.Fatalf("catalog kinds = %+v, want avatar, stamp, and prop", kinds)
	}
	beachBall, ok := domain.DailyDropCatalogItem("canvas-prop-beach-ball")
	if !ok || beachBall.Kind != domain.UnlockCanvasProp || beachBall.AssetID != "beach-ball" ||
		beachBall.Slot != "prop" || beachBall.Rarity != domain.UnlockUncommon {
		t.Fatalf("beach ball catalog item = %+v, found=%v", beachBall, ok)
	}
}

func TestSelectDailyDropItemNeverReturnsAnOwnedItem(t *testing.T) {
	items := domain.DailyDropCatalogItems()
	owned := map[string]bool{items[0].ID: true, items[1].ID: true}

	item, ok := domain.SelectDailyDropItem(owned, 0)
	if !ok {
		t.Fatal("expected an eligible item")
	}
	if owned[item.ID] {
		t.Fatalf("selected owned item %q", item.ID)
	}

	for _, candidate := range items {
		owned[candidate.ID] = true
	}
	if _, ok := domain.SelectDailyDropItem(owned, 0); ok {
		t.Fatal("complete collection returned another item")
	}
}

func TestSelectDailyDropItemBoundsTheDraw(t *testing.T) {
	items := domain.DailyDropCatalogItems()
	item, ok := domain.SelectDailyDropItem(nil, len(items)+2)
	if !ok || item.ID == "" {
		t.Fatalf("selected %+v from an oversized draw", item)
	}
}

func TestSelectDailyDropItemBalancesKindsWhileBothPoolsRemain(t *testing.T) {
	first, firstOK := domain.SelectDailyDropItem(nil, 0)
	second, secondOK := domain.SelectDailyDropItem(nil, 1)
	if !firstOK || !secondOK || first.Kind != domain.UnlockAvatarPart || second.Kind != domain.UnlockCanvasStamp {
		t.Fatalf("first two draws = %+v and %+v, want alternating pools", first, second)
	}
}
