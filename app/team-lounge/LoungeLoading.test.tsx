import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LoungeLoading } from "./LoungeLoading";

describe("LoungeLoading", () => {
  it("announces progress while keeping the animated artwork decorative", () => {
    const { container } = render(
      <LoungeLoading label="Gathering your teammates…" scene="starlight" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Gathering your teammates…",
    );
    expect(container.firstChild).toHaveAttribute("data-scene", "starlight");
    expect(
      container.querySelector(".team-lounge-loading__sprite"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps twelve square frames in a six-by-two sprite sheet", () => {
    const sprite = readFileSync(
      join(
        process.cwd(),
        "public",
        "team-lounge",
        "zoomigo-loader-12-frame.png",
      ),
    );
    const width = sprite.readUInt32BE(16);
    const height = sprite.readUInt32BE(20);

    expect(width).toBe(1_440);
    expect(height).toBe(480);
    expect(width / 6).toBe(height / 2);
  });
});
