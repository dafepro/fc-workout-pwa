import type { CSSProperties } from "react";
import type { StampAsset } from "../model";

export function StampAssetView({ asset }: { asset: StampAsset }) {
  if (asset.kind === "emoji") {
    return (
      <span
        className="tc-stamp-asset tc-stamp-asset--emoji"
        role="img"
        aria-label={asset.label}
      >
        {asset.glyph}
      </span>
    );
  }

  if (asset.kind === "image") {
    return (
      // Catalog assets are reviewed same-origin files; player-entered URLs do not exist.
      <img
        className="tc-stamp-asset tc-stamp-asset--image"
        src={asset.src}
        alt={asset.alt}
        draggable="false"
      />
    );
  }

  const style = {
    backgroundImage: `url("${asset.src}")`,
    backgroundSize: `${asset.frames * 100}% 100%`,
    aspectRatio: `${asset.frameWidth} / ${asset.frameHeight}`,
    "--tc-sprite-frames": asset.frames,
  } as CSSProperties;

  return (
    <span
      className="tc-stamp-asset tc-stamp-asset--sprite"
      role="img"
      aria-label={asset.alt}
      style={style}
    />
  );
}

export function stampAssetLabel(asset: StampAsset): string {
  return asset.kind === "emoji" ? asset.label : asset.alt;
}
