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
    const openButton = await screen.findByRole("button", {
      name: "Open Daily box, 1 waiting",
    });
    expect(screen.queryByText("Rover the dog")).not.toBeInTheDocument();

    fireEvent.click(openButton);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Rover the dog",
    );
    expect(
      screen.getByRole("link", { name: /use in avatar/i }),
    ).toHaveAttribute("href", "/me/avatar");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Your collection" }),
      ).toHaveFocus(),
    );
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

  it("groups sealed boxes by the three final API sources", async () => {
    const dailyTwo = { ...box, id: "prize_box_daily_2" };
    const threeDay = {
      ...box,
      id: "prize_box_plan_3",
      source: "plan_participation_3" as const,
    };
    const sevenDay = {
      ...box,
      id: "prize_box_plan_7",
      source: "plan_completion_7" as const,
    };
    render(
      <PrizeBoxesExperience
        gateway={gateway({
          overview: vi.fn().mockResolvedValue({
            day: "2026-08-27",
            dailyState: "claimed",
            readyCount: 4,
            earnedTotal: 4,
            openedTotal: 0,
            unopened: [box, dailyTwo, threeDay, sevenDay],
            recent: [],
          }),
        })}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Open Daily box, 2 waiting",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Open 3-day plan box, 1 waiting",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Open 7-day plan box, 1 waiting",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the box overview usable when inventory loading fails", async () => {
    render(
      <PrizeBoxesExperience
        gateway={gateway({
          inventory: vi.fn().mockRejectedValue(new Error("offline")),
        })}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Today’s box is ready" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your collection could not be loaded",
    );
    expect(
      screen.getByRole("button", { name: "Claim sealed box" }),
    ).toBeEnabled();
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

  it("keeps a failed open sealed and reuses its idempotency key", async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        id: box.id,
        source: box.source,
        item: unlock.item,
        openedAt: unlock.unlockedAt,
      });
    render(
      <PrizeBoxesExperience
        gateway={gateway({
          overview: vi.fn().mockResolvedValue({
            day: "2026-08-27",
            dailyState: "claimed",
            readyCount: 1,
            earnedTotal: 1,
            openedTotal: 0,
            unopened: [box],
            recent: [],
          }),
          open,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Daily box, 1 waiting",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your box is safe",
    );
    expect(
      screen.getByRole("button", { name: "Open Daily box, 1 waiting" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open.mock.calls[0][1]).toBe(open.mock.calls[1][1]);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Rover the dog",
    );
  });
});
