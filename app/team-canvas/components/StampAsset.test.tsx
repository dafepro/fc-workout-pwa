import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { StampAssetView } from "./StampAsset";

afterEach(cleanup);

describe("StampAssetView", () => {
  it("renders emoji, reviewed images, and sprite metadata through one contract", () => {
    const { container } = render(
      <>
        <StampAssetView
          asset={{
            id: "bolt",
            kind: "emoji",
            glyph: "⚡",
            label: "Bolt",
          }}
        />
        <StampAssetView
          asset={{
            id: "mark",
            kind: "image",
            src: "/favicon.svg",
            alt: "ZoomiGo mark",
          }}
        />
        <StampAssetView
          asset={{
            id: "runner",
            kind: "sprite",
            src: "/stamps/runner.webp",
            alt: "Running player",
            frames: 8,
            frameWidth: 64,
            frameHeight: 64,
          }}
        />
      </>,
    );

    expect(screen.getByRole("img", { name: "Bolt" })).toHaveTextContent("⚡");
    expect(screen.getByRole("img", { name: "ZoomiGo mark" })).toHaveAttribute(
      "src",
      "/favicon.svg",
    );
    expect(screen.getByRole("img", { name: "Running player" })).toHaveClass(
      "tc-stamp-asset--sprite",
    );
    expect(container.querySelector(".tc-stamp-asset--sprite")).toHaveStyle({
      backgroundImage: 'url("/stamps/runner.webp")',
    });
  });
});
