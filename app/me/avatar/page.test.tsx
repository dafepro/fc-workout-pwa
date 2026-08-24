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

const { push, saveAvatar, loadUnlockInventory, markUnlockViewed } = vi.hoisted(
  () => ({
    push: vi.fn(),
    saveAvatar: vi.fn().mockResolvedValue(undefined),
    loadUnlockInventory: vi.fn().mockResolvedValue([]),
    markUnlockViewed: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../state/auth-context", () => ({
  useAuth: () => ({ avatarConfig: defaultAvatar(), saveAvatar }),
}));
vi.mock("../../data/unlock-inventory-gateway", () => ({
  loadUnlockInventory,
  markUnlockViewed,
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  saveAvatar.mockClear();
  loadUnlockInventory.mockClear();
  markUnlockViewed.mockClear();
});

describe("AvatarStudioPage", () => {
  it("returns to the profile with a toast flag after saving", async () => {
    render(<AvatarStudioPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Tall person" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAvatar).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/me?avatar=saved");
  });

  it("loads earned parts and acknowledges a new part when Head is opened", async () => {
    loadUnlockInventory.mockResolvedValueOnce([
      {
        item: {
          id: "avatar-head-dog",
          kind: "avatar_part",
          slot: "head",
          assetId: "dog",
          label: "Rover the dog",
          catalogVersion: 1,
        },
        source: "daily_drop",
        unlockedAt: "2026-08-24T14:00:00Z",
      },
    ]);
    render(<AvatarStudioPage />);

    expect(
      await screen.findByRole("radio", { name: /Rover the dog.*new/i }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Head" }));
    await waitFor(() =>
      expect(markUnlockViewed).toHaveBeenCalledWith("avatar-head-dog"),
    );
  });
});
