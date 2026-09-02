import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoungeItemArt } from "./LoungeItemArt";

describe("LoungeItemArt", () => {
  it("renders independent duck sprites over the pond using replicated flock motion", () => {
    const { container } = render(
      <LoungeItemArt
        item={{
          glyph: "🦆",
          imageSrc: "/team-lounge/items/duck-pond-v1.png",
          kind: "lounge_prop",
          label: "Duck pond",
          duckFlock: { heading: Math.PI / 2, intensity: 0.75 },
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Duck pond" })).toHaveAttribute(
      "src",
      "/team-lounge/items/duck-pond-v1.png",
    );
    expect(container.querySelectorAll("[data-duck]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-duck] > span")).toHaveLength(3);
    expect(container.firstElementChild).toHaveStyle({
      "--duck-flee-x": "0",
      "--duck-flee-y": "0.75",
      "--duck-heading": `${Math.PI / 2}rad`,
    });
  });

  it("animates the hammock only while an avatar is settled in it", () => {
    const { container, rerender } = render(
      <LoungeItemArt
        item={{
          glyph: "🌴",
          imageSrc: "/team-lounge/items/hammock-sprite-v2.png",
          kind: "lounge_prop",
          label: "Hammock",
          hammockOccupied: false,
        }}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-hammock-occupied",
      "false",
    );

    rerender(
      <LoungeItemArt
        item={{
          glyph: "🌴",
          imageSrc: "/team-lounge/items/hammock-sprite-v2.png",
          kind: "lounge_prop",
          label: "Hammock",
          hammockOccupied: true,
        }}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-hammock-occupied",
      "true",
    );
  });

  it("keeps picker bumpers armed and only springs placed bumpers after impact", () => {
    const { container, rerender } = render(
      <LoungeItemArt
        item={{
          glyph: "🔴",
          imageSrc: "/team-lounge/items/pinball-bumper-sprite-v2.png",
          kind: "lounge_prop",
          label: "Pinball bumper",
          bumperSequence: 1,
        }}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-bumper-state",
      "armed",
    );
    expect(container.querySelector("[data-bumper-sequence]")).toHaveAttribute(
      "data-bumper-sequence",
      "0",
    );

    rerender(
      <LoungeItemArt
        item={{
          glyph: "🔴",
          imageSrc: "/team-lounge/items/pinball-bumper-sprite-v2.png",
          kind: "lounge_prop",
          label: "Pinball bumper",
          bumperSequence: 2,
        }}
        playBehaviorAnimation
      />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-bumper-state",
      "springing",
    );
    expect(container.querySelector("[data-bumper-sequence]")).toHaveAttribute(
      "data-bumper-sequence",
      "2",
    );
  });
});
