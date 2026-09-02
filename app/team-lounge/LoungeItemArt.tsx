import type { CSSProperties } from "react";

import type { LoungeItemChoice } from "./lounge-items";

type LoungeItemArtSource = Pick<
  LoungeItemChoice,
  "artOffset" | "glyph" | "imageSrc" | "kind" | "label"
> & {
  duckFlock?: Readonly<{ heading: number; intensity: number }>;
  hammockOccupied?: boolean;
  bumperSequence?: number;
};

export function LoungeItemArt({
  item,
  decorative = false,
}: {
  item: LoungeItemArtSource;
  decorative?: boolean;
}) {
  const className = `team-lounge__item-art team-lounge__item-art--${item.kind === "lounge_stamp" ? "stamp" : "item"}`;
  const artOffsetStyle = item.artOffset
    ? ({
        "--lounge-art-offset-x": `${item.artOffset.xPercent}%`,
        "--lounge-art-offset-y": `${item.artOffset.yPercent}%`,
      } as CSSProperties)
    : undefined;
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
            ...artOffsetStyle,
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
  if (item.imageSrc === "/team-lounge/items/hammock-sprite-v2.png") {
    return (
      <span
        className={`${className} team-lounge__sprite team-lounge__hammock-sprite`}
        data-hammock-occupied={String(item.hammockOccupied ?? false)}
        style={artOffsetStyle}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : item.label}
        aria-hidden={decorative || undefined}
      />
    );
  }
  if (item.imageSrc === "/team-lounge/items/pinball-bumper-sprite-v2.png") {
    const sequence = item.bumperSequence ?? 0;
    return (
      <span
        className={`${className} team-lounge__sprite team-lounge__bumper-sprite`}
        style={artOffsetStyle}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : item.label}
        aria-hidden={decorative || undefined}
      >
        <i key={sequence} data-bumper-frame={sequence} aria-hidden="true" />
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
      style={artOffsetStyle}
    />
  ) : (
    <span className={className} aria-hidden="true">
      {item.glyph}
    </span>
  );
}
