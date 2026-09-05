import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseAvatarCatalog } from "../catalog";
import type { AvatarLoadout } from "../types";
import catalogSource from "../../../public/avatar/catalog/avatar-catalog.engineering.json";
import { AvatarDemo } from "./AvatarDemo";

vi.mock("../AvatarStage", () => ({
  AvatarStage: ({
    loadout,
    viewRadians,
  }: {
    loadout: AvatarLoadout;
    viewRadians: number;
  }) => (
    <output data-view={viewRadians} data-testid="loadout-probe">
      {JSON.stringify(loadout)}
    </output>
  ),
}));

const catalog = parseAvatarCatalog(catalogSource);

describe("AvatarDemo customizer", () => {
  it("changes independently selected equipment and tint variants", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.engineering.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tops" }));
    fireEvent.click(screen.getByRole("radio", { name: "Training Layer" }));
    fireEvent.click(screen.getByRole("radio", { name: "Breakaway Teal" }));

    expect(screen.getByTestId("loadout-probe")).toHaveTextContent(
      '"top":{"itemId":"top.training-layer","variantId":"teal"}',
    );
  });

  it("changes skin tone through the curated appearance palette", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.engineering.json"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Deep Umber" }));

    expect(screen.getByTestId("loadout-probe")).toHaveTextContent(
      '"skinToneId":"skin.05"',
    );
  });

  it("explains when compatible headwear temporarily hides hair", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.engineering.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Headwear" }));
    fireEvent.click(screen.getByRole("radio", { name: "Touchline Cap" }));

    expect(
      screen.getByText("Your hairstyle is saved and hidden under this item."),
    ).toBeVisible();
  });

  it("offers every review category and removable accessories", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.engineering.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eyewear" }));
    fireEvent.click(screen.getByRole("radio", { name: "Sport Frames" }));
    expect(screen.getByTestId("loadout-probe")).toHaveTextContent(
      '"eyewear":{"itemId":"eyewear.sport-frames"}',
    );
    fireEvent.click(screen.getByRole("radio", { name: "No eyewear" }));
    expect(screen.getByTestId("loadout-probe")).not.toHaveTextContent(
      "eyewear.sport-frames",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back gear" }));
    expect(screen.getByRole("radio", { name: "Training Pack" })).toBeVisible();
  });

  it("changes the inspection angle without changing the loadout", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.engineering.json"
      />,
    );

    const probe = screen.getByTestId("loadout-probe");
    const originalLoadout = probe.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Back view" }));

    expect(probe).toHaveAttribute("data-view", String(Math.PI));
    expect(probe).toHaveTextContent(originalLoadout ?? "");
  });
});
