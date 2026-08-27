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
