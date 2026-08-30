import { copy } from "../content/copy";
import type { PrizeItem } from "../data/prize-box-gateway";

export function PrizeRarityBadge({ rarity }: { rarity: PrizeItem["rarity"] }) {
  return (
    <span className={`prize-rarity prize-rarity--${rarity}`}>
      {copy.prizes.rarities[rarity]}
    </span>
  );
}
