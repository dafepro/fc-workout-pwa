package domain_test

import (
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestPrizeCatalogSelectsOnlyUnownedPredefinedItems(t *testing.T) {
	catalog := domain.PrizeCatalogItems()
	if len(catalog) < 2 {
		t.Fatalf("catalog has %d items, want multiple destinations", len(catalog))
	}
	for _, item := range catalog {
		if item.ID == "" || item.Label == "" || item.CatalogVersion != 1 {
			t.Fatalf("invalid predefined item: %+v", item)
		}
	}

	first, found := domain.SelectPrizeItem(map[string]bool{}, 0)
	if !found || first.Destination != domain.PrizeDestinationAvatar {
		t.Fatalf("first pool selection = %+v, %v", first, found)
	}
	owned := map[string]bool{}
	for _, item := range catalog {
		if item.Destination == domain.PrizeDestinationAvatar {
			owned[item.ID] = true
		}
	}
	lounge, found := domain.SelectPrizeItem(owned, 0)
	if !found || lounge.Destination != domain.PrizeDestinationTeamLounge {
		t.Fatalf("exhausted avatar pool did not fall back to lounge: %+v, %v", lounge, found)
	}
	for _, item := range catalog {
		owned[item.ID] = true
	}
	if item, found := domain.SelectPrizeItem(owned, 9); found {
		t.Fatalf("complete collection selected %+v", item)
	}
}

func TestPrizeCatalogIncludesTheTenPartAvatarRewardPack(t *testing.T) {
	want := map[string]struct {
		slot, asset string
	}{
		"avatar-head-owl":          {slot: "head", asset: "owl"},
		"avatar-head-panda":        {slot: "head", asset: "panda"},
		"avatar-head-lion":         {slot: "head", asset: "lion"},
		"avatar-kit-checkers":      {slot: "kit", asset: "checkers"},
		"avatar-kit-starburst":     {slot: "kit", asset: "starburst"},
		"avatar-hat-bucket":        {slot: "hat", asset: "bucket"},
		"avatar-hat-wizard":        {slot: "hat", asset: "wizard"},
		"avatar-eyewear-lightning": {slot: "eyewear", asset: "lightning"},
		"avatar-eyewear-hearts":    {slot: "eyewear", asset: "hearts"},
		"avatar-effect-confetti":   {slot: "effect", asset: "confetti"},
	}

	for _, item := range domain.PrizeCatalogItems() {
		expected, found := want[item.ID]
		if !found {
			continue
		}
		if item.Kind != domain.PrizeAvatarPart || item.Destination != domain.PrizeDestinationAvatar || item.Slot != expected.slot || item.AssetID != expected.asset || item.Label == "" {
			t.Fatalf("avatar reward %s = %+v", item.ID, item)
		}
		delete(want, item.ID)
	}
	if len(want) != 0 {
		t.Fatalf("avatar rewards missing from catalog: %v", want)
	}
}
