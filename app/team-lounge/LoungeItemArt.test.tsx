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
    expect(container.firstElementChild).toHaveStyle({
      "--duck-flee-x": "0",
      "--duck-flee-y": "0.75",
      "--duck-heading": `${Math.PI / 2}rad`,
    });
  });
});
