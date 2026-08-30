import type { LoungeItemChoice } from "./lounge-items";

type LoungeItemArtSource = Pick<
  LoungeItemChoice,
  "glyph" | "imageSrc" | "kind" | "label"
>;

export function LoungeItemArt({
  item,
  decorative = false,
}: {
  item: LoungeItemArtSource;
  decorative?: boolean;
}) {
  const className = `team-lounge__item-art team-lounge__item-art--${item.kind === "lounge_stamp" ? "stamp" : "item"}`;
  return item.imageSrc ? (
    // Canvas overlays own sizing and transforms, so framework image layout is not applicable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={item.imageSrc}
      alt={decorative ? "" : item.label}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    />
  ) : (
    <span className={className} aria-hidden="true">
      {item.glyph}
    </span>
  );
}
