import { AvatarPartArt } from "../avatar/AvatarArt";
import { AVATAR_LAYERS } from "../avatar/catalog";
import { defaultAvatar } from "../avatar/config";
import type { PrizeItem } from "../data/prize-box-gateway";
import { LoungeItemArt } from "../team-lounge/LoungeItemArt";
import { loungePrizeItem } from "../team-lounge/lounge-items";

export function PrizeItemArt({
  item,
  featured = false,
}: {
  item: PrizeItem;
  featured?: boolean;
}) {
  const className = `prize-item-art${featured ? " prize-item-art--featured" : ""}`;

  if (item.kind === "avatar_part") {
    const layer = AVATAR_LAYERS.find(({ kind }) => kind === item.slot);
    const option = layer?.options.find(({ id }) => id === item.assetId);
    if (layer && option) {
      return (
        <div className={className} data-prize-art={item.id}>
          <AvatarPartArt
            kind={layer.kind}
            option={option}
            config={defaultAvatar()}
          />
        </div>
      );
    }
  }

  const loungeItem = loungePrizeItem(item);
  if (loungeItem) {
    return (
      <div className={className} data-prize-art={item.id}>
        <LoungeItemArt item={loungeItem} decorative />
      </div>
    );
  }

  return (
    <div
      className={className}
      data-prize-art-missing={item.id}
      role="img"
      aria-label={item.label}
    >
      🎁
    </div>
  );
}
