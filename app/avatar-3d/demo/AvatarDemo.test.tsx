import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseAvatarCatalog } from "../catalog";
import type { AvatarLoadout } from "../types";
import catalogSource from "../../../public/avatar/catalog/avatar-catalog.reference.json";
import { AvatarDemo } from "./AvatarDemo";

vi.mock("../AvatarStage", () => ({
  AvatarStage: ({ loadout }: { loadout: AvatarLoadout }) => (
    <output data-testid="loadout-probe">{JSON.stringify(loadout)}</output>
  ),
}));

const catalog = parseAvatarCatalog(catalogSource);

describe("AvatarDemo customizer", () => {
  it("changes independently selected equipment and tint variants", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.reference.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tops" }));
    fireEvent.click(screen.getByRole("radio", { name: "Touchline Jersey" }));
    fireEvent.click(screen.getByRole("radio", { name: "Open Sky" }));

    expect(screen.getByTestId("loadout-probe")).toHaveTextContent(
      '"top":{"itemId":"top.touchline-jersey.reference","variantId":"sky"}',
    );
  });

  it("explains when compatible headwear temporarily hides hair", () => {
    render(
      <AvatarDemo
        catalog={catalog}
        catalogURL="/avatar/catalog/avatar-catalog.reference.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Headwear" }));
    fireEvent.click(screen.getByRole("radio", { name: "Touchline Cap" }));

    expect(
      screen.getByText("Your hairstyle is saved and hidden under this item."),
    ).toBeVisible();
  });
});
