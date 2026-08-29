import type { LoungeItemChoice } from "./lounge-items";

type LoungeItemArtSource = Pick<
  LoungeItemChoice,
  "glyph" | "imageSrc" | "label"
>;

export function LoungeItemArt({
  item,
  decorative = false,
}: {
  item: LoungeItemArtSource;
  decorative?: boolean;
}) {
  return item.imageSrc ? (
    // Canvas overlays own sizing and transforms, so framework image layout is not applicable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="team-lounge__item-art"
      src={item.imageSrc}
      alt={decorative ? "" : item.label}
    />
  ) : (
    <span className="team-lounge__item-art" aria-hidden="true">
      {item.glyph}
    </span>
  );
}
