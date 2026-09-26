import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../../avatar/config";
import AvatarStudioPage from "./page";
import { clearPlayerDrafts } from "../../state/player-drafts";

const {
  push,
  saveAvatar,
  inventory,
  markViewed,
  unlockDevelopmentCatalogItems,
} = vi.hoisted(() => ({
  push: vi.fn(),
  saveAvatar: vi.fn().mockResolvedValue(undefined),
  inventory: vi.fn().mockResolvedValue([]),
  markViewed: vi.fn().mockResolvedValue(undefined),
  unlockDevelopmentCatalogItems: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../state/auth-context", () => ({
  useAuth: () => ({
    connected: true,
    currentPlayerID: "player-one",
    avatarConfig: defaultAvatar(),
    saveAvatar,
    runtime: {
      currentTeam: { id: "team-one" },
      prizeBoxes: { inventory, markViewed },
    },
  }),
}));
vi.mock("../../build-profile", () => ({ developmentBuild: true }));
vi.mock("../../development/catalog-unlocks", () => ({
  unlockDevelopmentCatalogItems,
}));

afterEach(() => {
  cleanup();
  clearPlayerDrafts();
  push.mockClear();
  saveAvatar.mockClear();
  inventory.mockReset().mockResolvedValue([]);
  markViewed.mockReset().mockResolvedValue(undefined);
  unlockDevelopmentCatalogItems.mockReset().mockResolvedValue(undefined);
});

describe("AvatarStudioPage", () => {
  it("does not present an unavailable inventory as locked ownership and can retry", async () => {
    inventory.mockRejectedValueOnce(new Error("offline"));
    render(<AvatarStudioPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your owned items are safe",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("radio", { name: "Tall person" }),
    ).toBeEnabled();
  });
  it("returns to the profile with a toast flag after saving", async () => {
    render(<AvatarStudioPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "Tall person" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAvatar).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/me?avatar=saved");
  });

  it("enables owned Avatar parts and records that the Studio showed them", async () => {
    inventory.mockResolvedValue([
      {
        item: {
          id: "avatar-head-dog",
          kind: "avatar_part",
          slot: "head",
          assetId: "dog",
          label: "Rover the dog",
          catalogVersion: 1,
          rarity: "common",
          destination: "avatar",
        },
        source: "daily_check_in",
        unlockedAt: "2026-08-27T12:00:00Z",
      },
    ]);

    render(<AvatarStudioPage />);

    expect(
      await screen.findByRole("radio", { name: "Rover the dog" }),
    ).toBeEnabled();
    await waitFor(() =>
      expect(markViewed).toHaveBeenCalledWith("avatar-head-dog"),
    );
    expect(inventory).toHaveBeenCalledWith(["avatar_part"]);
    expect(unlockDevelopmentCatalogItems).toHaveBeenCalledTimes(1);
    expect(
      unlockDevelopmentCatalogItems.mock.invocationCallOrder[0],
    ).toBeLessThan(inventory.mock.invocationCallOrder[0]!);
  });
});
