package domain

type PrizeItemKind string
type PrizeRarity string
type PrizeDestination string

const (
	PrizeAvatarPart     PrizeItemKind = "avatar_part"
	PrizeLoungeStamp    PrizeItemKind = "lounge_stamp"
	PrizeLoungeProp     PrizeItemKind = "lounge_prop"
	PrizeLoungeChatPack PrizeItemKind = "lounge_chat_pack"

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
	{ID: "avatar-head-owl", Kind: PrizeAvatarPart, Slot: "head", AssetID: "owl", Label: "Night owl", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-panda", Kind: PrizeAvatarPart, Slot: "head", AssetID: "panda", Label: "Piper the panda", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-lion", Kind: PrizeAvatarPart, Slot: "head", AssetID: "lion", Label: "Leo the lion", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationAvatar},
	{ID: "avatar-kit-checkers", Kind: PrizeAvatarPart, Slot: "kit", AssetID: "checkers", Label: "Checkerboard kit", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationAvatar},
	{ID: "avatar-kit-starburst", Kind: PrizeAvatarPart, Slot: "kit", AssetID: "starburst", Label: "Starburst kit", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-hat-bucket", Kind: PrizeAvatarPart, Slot: "hat", AssetID: "bucket", Label: "Bucket hat", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationAvatar},
	{ID: "avatar-hat-wizard", Kind: PrizeAvatarPart, Slot: "hat", AssetID: "wizard", Label: "Wizard hat", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationAvatar},
	{ID: "avatar-eyewear-lightning", Kind: PrizeAvatarPart, Slot: "eyewear", AssetID: "lightning", Label: "Lightning glasses", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-eyewear-hearts", Kind: PrizeAvatarPart, Slot: "eyewear", AssetID: "hearts", Label: "Heart glasses", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationAvatar},
	{ID: "avatar-effect-confetti", Kind: PrizeAvatarPart, Slot: "effect", AssetID: "confetti", Label: "Confetti effect", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-prism-dragon", Kind: PrizeAvatarPart, Slot: "head", AssetID: "prism-dragon", Label: "Prism dragon", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-head-moon-axolotl", Kind: PrizeAvatarPart, Slot: "head", AssetID: "moon-axolotl", Label: "Moonlit axolotl", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-kit-nebula-armor", Kind: PrizeAvatarPart, Slot: "kit", AssetID: "nebula-armor", Label: "Nebula armor kit", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-kit-phoenix-flight", Kind: PrizeAvatarPart, Slot: "kit", AssetID: "phoenix-flight", Label: "Phoenix flight kit", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-hat-astronaut", Kind: PrizeAvatarPart, Slot: "hat", AssetID: "astronaut", Label: "Astronaut helmet", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-hat-crystal-antlers", Kind: PrizeAvatarPart, Slot: "hat", AssetID: "crystal-antlers", Label: "Crystal antler crown", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-eyewear-hologram-visor", Kind: PrizeAvatarPart, Slot: "eyewear", AssetID: "hologram-visor", Label: "Hologram visor", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-eyewear-clockwork", Kind: PrizeAvatarPart, Slot: "eyewear", AssetID: "clockwork", Label: "Clockwork goggles", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-effect-aurora", Kind: PrizeAvatarPart, Slot: "effect", AssetID: "aurora", Label: "Aurora ribbons", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "avatar-effect-meteor-shower", Kind: PrizeAvatarPart, Slot: "effect", AssetID: "meteor-shower", Label: "Meteor shower", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationAvatar},
	{ID: "lounge-stamp-shield", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "shield", Label: "Shield stamp", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-target", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "target", Label: "Target stamp", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-rainbow", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "rainbow", Label: "Rainbow stamp", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-lion", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "lion", Label: "Lion stamp", CatalogVersion: 1, Rarity: PrizeEpic, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-rocket", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "rocket", Label: "Rocket stamp", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-stamp-sparkles", Kind: PrizeLoungeStamp, Slot: "stamp", AssetID: "sparkles", Label: "Sparkles stamp", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-prop-beach-ball", Kind: PrizeLoungeProp, Slot: "prop", AssetID: "beach-ball", Label: "Beach ball", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-chat-pack-pirate-1", Kind: PrizeLoungeChatPack, Slot: "quick_message_pack", AssetID: "pirate-1", Label: "Pirate 1 chat pack", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-chat-pack-gen-alpha", Kind: PrizeLoungeChatPack, Slot: "quick_message_pack", AssetID: "gen-alpha", Label: "Gen Alpha chat pack", CatalogVersion: 1, Rarity: PrizeUncommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-chat-pack-space-cadet", Kind: PrizeLoungeChatPack, Slot: "quick_message_pack", AssetID: "space-cadet", Label: "Space Cadet chat pack", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-chat-pack-sideline", Kind: PrizeLoungeChatPack, Slot: "quick_message_pack", AssetID: "sideline", Label: "Sideline chat pack", CatalogVersion: 1, Rarity: PrizeCommon, Destination: PrizeDestinationTeamLounge},
	{ID: "lounge-chat-pack-snack-attack", Kind: PrizeLoungeChatPack, Slot: "quick_message_pack", AssetID: "snack-attack", Label: "Snack Attack chat pack", CatalogVersion: 1, Rarity: PrizeRare, Destination: PrizeDestinationTeamLounge},
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
