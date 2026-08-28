package domain

type PrizeItemKind string
type PrizeRarity string
type PrizeDestination string

const (
	PrizeAvatarPart  PrizeItemKind = "avatar_part"
	PrizeLoungeStamp PrizeItemKind = "lounge_stamp"
	PrizeLoungeProp  PrizeItemKind = "lounge_prop"

	PrizeCommon   PrizeRarity = "common"
	PrizeUncommon PrizeRarity = "uncommon"
	PrizeRare     PrizeRarity = "rare"
	PrizeEpic     PrizeRarity = "epic"

	PrizeDestinationAvatar     PrizeDestination = "avatar"
	PrizeDestinationTeamLounge PrizeDestination = "team_lounge"
)

type PrizeItem struct {
	ID             string           `json:"id"`
	Kind           PrizeItemKind    `json:"kind"`
	Slot           string           `json:"slot"`
	AssetID        string           `json:"assetId"`
	Label          string           `json:"label"`
	CatalogVersion int              `json:"catalogVersion"`
	Rarity         PrizeRarity      `json:"rarity"`
	Destination    PrizeDestination `json:"destination"`
}

var prizeCatalog = []PrizeItem{
	{ID: "avatar-head-dog", Kind: PrizeAvatarPart, Slot: "head", AssetID: "dog", Label: "Rover the dog", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-cheetah", Kind: PrizeAvatarPart, Slot: "head", AssetID: "cheetah", Label: "Zoomi the cheetah", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-fox", Kind: PrizeAvatarPart, Slot: "head", AssetID: "fox", Label: "Scout the fox", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationAvatar},
	{ID: "lounge-stamp-shield", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "shield", Label: "Shield stamp", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-target", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "target", Label: "Target stamp", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-rainbow", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "rainbow", Label: "Rainbow stamp", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-lion", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "lion", Label: "Lion stamp", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-rocket", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "rocket", Label: "Rocket stamp", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-sparkles", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "sparkles", Label: "Sparkles stamp", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-prop-beach-ball", Kind: PrizeLoungeProp, Slot: "prop", AssetID: "beach-ball", Label: "Beach ball", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
}

func PrizeCatalogItems() []PrizeItem {
	return append([]PrizeItem(nil), prizeCatalog...)
}

func PrizeCatalogItem(itemID string) (PrizeItem, bool) {
	for _, item := range prizeCatalog {
		if item.ID == itemID {
			return item, true
		}
	}
	return PrizeItem{}, false
}

// SelectPrizeItem balances the two destinations, then selects within the
// chosen unowned pool. The caller supplies a server-generated draw.
func SelectPrizeItem(owned map[string]bool, draw int) (PrizeItem, bool) {
	avatar := make([]PrizeItem, 0, len(prizeCatalog))
	lounge := make([]PrizeItem, 0, len(prizeCatalog))
	for _, item := range prizeCatalog {
		if owned[item.ID] {
			continue
		}
		if item.Destination == PrizeDestinationAvatar {
			avatar = append(avatar, item)
		} else {
			lounge = append(lounge, item)
		}
	}
	if len(avatar) == 0 && len(lounge) == 0 {
		return PrizeItem{}, false
	}
	if draw < 0 {
		draw = -(draw + 1)
	}
	pool := avatar
	if draw%2 == 1 {
		pool = lounge
	}
	if len(pool) == 0 {
		if len(avatar) > 0 {
			pool = avatar
		} else {
			pool = lounge
		}
	}
	return pool[(draw/2)%len(pool)], true
}
