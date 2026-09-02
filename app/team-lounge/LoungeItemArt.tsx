import type { CSSProperties } from "react";

import type { LoungeItemChoice } from "./lounge-items";

type LoungeItemArtSource = Pick<
  LoungeItemChoice,
  "glyph" | "imageSrc" | "kind" | "label"
> & {
  duckFlock?: Readonly<{ heading: number; intensity: number }>;
};

export function LoungeItemArt({
  item,
  decorative = false,
}: {
  item: LoungeItemArtSource;
  decorative?: boolean;
}) {
  const className = `team-lounge__item-art team-lounge__item-art--${item.kind === "lounge_stamp" ? "stamp" : "item"}`;
  if (item.imageSrc === "/team-lounge/items/duck-pond-v1.png") {
    const heading = item.duckFlock?.heading ?? 0;
    const intensity = item.duckFlock?.intensity ?? 0;
    const component = (value: number) =>
      Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(4));
    return (
      <span
        className={`${className} team-lounge__duck-pond`}
        style={
          {
            "--duck-flee-x": `${component(Math.cos(heading) * intensity)}`,
            "--duck-flee-y": `${component(Math.sin(heading) * intensity)}`,
            "--duck-heading": `${heading}rad`,
          } as CSSProperties
        }
      >
        {/* Canvas overlays own sizing and transforms, so framework image layout is not applicable. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="team-lounge__duck-pond-base"
          src={item.imageSrc}
          alt={decorative ? "" : item.label}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
        {["leader", "left", "right"].map((duck) => (
          <i key={duck} data-duck={duck} aria-hidden="true" />
        ))}
      </span>
    );
  }
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
