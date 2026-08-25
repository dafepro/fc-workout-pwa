import { AvatarPartArt } from "../avatar/AvatarArt";
import { AVATAR_LAYERS } from "../avatar/catalog";
import { defaultAvatar } from "../avatar/config";
import { findTeamCanvasStamp } from "../team-canvas/catalog";
import { StampAssetView } from "../team-canvas/components/StampAsset";
import type { PrizeItem } from "../data/prize-box-gateway";

export function PrizeItemArt({ item }: { item: PrizeItem }) {
  if (item.kind === "canvas_stamp") {
    const asset = findTeamCanvasStamp(item.assetId);
    return (
      <span className="prize-item-art prize-item-art--stamp">
        {asset ? (
          <StampAssetView asset={asset} />
        ) : (
          <span aria-hidden="true">◆</span>
        )}
      </span>
    );
  }

  const layer = AVATAR_LAYERS.find(({ kind }) => kind === item.slot);
  const option = layer?.options.find(({ id }) => id === item.assetId);
  return (
    <span className="prize-item-art prize-item-art--avatar">
      {layer && option ? (
        <AvatarPartArt
          kind={layer.kind}
          option={option}
          config={defaultAvatar()}
        />
      ) : (
        <span aria-hidden="true">◇</span>
      )}
    </span>
  );
}

export function PrizeBoxVisual({ open = false }: { open?: boolean }) {
  return (
    <span
      className={`prize-box-art${open ? " is-open" : ""}`}
      aria-hidden="true"
    >
      <span className="prize-box-art__lid" />
      <span className="prize-box-art__body" />
      <span className="prize-box-art__band" />
      <span className="prize-box-art__clasp" />
    </span>
  );
}
