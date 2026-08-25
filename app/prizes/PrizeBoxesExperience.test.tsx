import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenedPrizeBox,
  PrizeBoxGateway,
  PrizeBoxOverview,
} from "../data/prize-box-gateway";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

const emptyOverview: PrizeBoxOverview = {
  day: "2026-08-25",
  dailyState: "available",
  readyCount: 0,
  earnedTotal: 3,
  openedTotal: 3,
  unopened: [],
  recent: [],
};

function gateway(overrides: Partial<PrizeBoxGateway> = {}): PrizeBoxGateway {
  return {
    overview: vi.fn().mockResolvedValue(emptyOverview),
    claimDaily: vi.fn().mockResolvedValue({
      id: "daily-drop-one",
      state: "unopened",
      source: "daily_check_in",
      earnedAt: "2026-08-25T12:00:00Z",
    }),
    open: vi.fn(),
    ...overrides,
  };
}

describe("PrizeBoxesExperience", () => {
  it("claims the daily freebie into the unopened pool without revealing it", async () => {
    const claimDaily = vi.fn().mockResolvedValue({
      id: "daily-drop-one",
      state: "unopened",
      source: "daily_check_in",
      earnedAt: "2026-08-25T12:00:00Z",
    });
    const open = vi.fn();
    render(
      <PrizeBoxesExperience
        connected
        gateway={gateway({ claimDaily, open })}
      />,
    );

    expect(await screen.findByText("Prize boxes")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Prize box status" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Claim daily box" }));

    expect(await screen.findByText("Daily box claimed")).toBeVisible();
    expect(screen.getByText("Added to your boxes.")).toBeVisible();
    expect(screen.getByText("1 to open")).toBeVisible();
    expect(open).not.toHaveBeenCalled();
  });

  it("opens help in a viewport-level dialog that can be dismissed", async () => {
    render(<PrizeBoxesExperience connected gateway={gateway()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "How Prize Boxes work" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "How Prize Boxes work",
    });
    expect(dialog).toHaveClass("prize-help-modal");
    expect(dialog).toHaveTextContent("Claiming adds a sealed box");

    fireEvent.click(screen.getByRole("button", { name: "Close help" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a selected box and focuses the reveal on actual item art and destination", async () => {
    const overview: PrizeBoxOverview = {
      ...emptyOverview,
      dailyState: "claimed",
      readyCount: 1,
      earnedTotal: 4,
      unopened: [
        {
          id: "plan-prize-one",
          state: "unopened",
          source: "plan_participation_3",
          earnedAt: "2026-08-25T12:00:00Z",
        },
      ],
    };
    const opened: OpenedPrizeBox = {
      id: "plan-prize-one",
      state: "claimed",
      source: "plan_participation_3",
      day: "2026-08-25",
      timeZone: "America/Chicago",
      claimedAt: "2026-08-25T12:01:00Z",
      item: {
        id: "canvas-stamp-lion",
        kind: "canvas_stamp",
        slot: "stamp",
        assetId: "lion",
        label: "Lion stamp",
        catalogVersion: 1,
        rarity: "epic",
        destination: "team_lounge",
      },
    };
    const open = vi.fn().mockResolvedValue(opened);
    const load = vi
      .fn()
      .mockResolvedValueOnce(overview)
      .mockResolvedValue({
        ...overview,
        readyCount: 0,
        openedTotal: 4,
        unopened: [],
      });
    render(
      <PrizeBoxesExperience
        connected
        gateway={gateway({ overview: load, open })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Open From workouts box" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Zoomi found something!" }),
    ).toBeVisible();
    expect(screen.getByText("Lion stamp")).toBeVisible();
    expect(screen.getByText("Epic")).toBeVisible();
    expect(screen.getByText("Team Lounge")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Use in Team Lounge" }),
    ).toHaveAttribute("href", "/team");
    expect(open).toHaveBeenCalledWith("plan-prize-one", expect.any(String));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
