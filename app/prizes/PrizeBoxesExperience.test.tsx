import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PrizeBoxGateway } from "../data/prize-box-gateway";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

const box = {
  id: "prize_box_1234",
  source: "daily_check_in",
  earnedAt: "2026-08-27T12:00:00Z",
} as const;
const unlock = {
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
  unlockedAt: "2026-08-27T12:01:00Z",
} as const;

function gateway(overrides: Partial<PrizeBoxGateway> = {}): PrizeBoxGateway {
  return {
    overview: vi.fn().mockResolvedValue({
      day: "2026-08-27",
      dailyState: "available",
      readyCount: 0,
      earnedTotal: 0,
      openedTotal: 0,
      unopened: [],
      recent: [],
    }),
    inventory: vi.fn().mockResolvedValue([]),
    markViewed: vi.fn().mockRejectedValue(new Error("not used here")),
    claimDaily: vi.fn().mockResolvedValue(box),
    open: vi.fn().mockResolvedValue({
      id: box.id,
      source: box.source,
      item: unlock.item,
      openedAt: unlock.unlockedAt,
    }),
    ...overrides,
  };
}

describe("PrizeBoxesExperience", () => {
  it("keeps the daily prize sealed until the player opens it", async () => {
    const api = gateway();
    render(<PrizeBoxesExperience gateway={api} />);

    fireEvent.click(await screen.findByRole("button", { name: /claim/i }));
    expect(await screen.findByText("1 box ready")).toBeInTheDocument();
    expect(screen.queryByText("Rover the dog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open box/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Rover the dog",
    );
    expect(
      screen.getByRole("link", { name: /use in avatar/i }),
    ).toHaveAttribute("href", "/me/avatar");
  });

  it("shows collection history on the same page", async () => {
    const api = gateway({ inventory: vi.fn().mockResolvedValue([unlock]) });
    render(<PrizeBoxesExperience gateway={api} />);

    expect(
      await screen.findByRole("heading", { name: "Your collection" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rover the dog")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /all prizes/i }),
    ).not.toBeInTheDocument();
  });

  it("reuses a failed action's idempotency key when retried", async () => {
    const claimDaily = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(box);
    render(<PrizeBoxesExperience gateway={gateway({ claimDaily })} />);

    fireEvent.click(await screen.findByRole("button", { name: /claim/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(claimDaily).toHaveBeenCalledTimes(2));

    expect(claimDaily.mock.calls[0][0]).toBe(claimDaily.mock.calls[1][0]);
  });
});
