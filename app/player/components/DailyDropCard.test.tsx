import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  DailyDropClaim,
  DailyDropGateway,
} from "../../data/daily-drop-gateway";
import { DailyDropCard } from "./DailyDropCard";

const avatarClaim: DailyDropClaim = {
  id: "daily-drop-one",
  state: "claimed",
  source: "daily_check_in",
  day: "2026-08-24",
  timeZone: "America/Chicago",
  claimedAt: "2026-08-24T12:00:00Z",
  item: {
    id: "avatar-head-dog",
    kind: "avatar_part",
    slot: "head",
    assetId: "dog",
    label: "Rover the dog",
    catalogVersion: 1,
  },
};

function gateway(
  status: DailyDropGateway["status"],
  claim: DailyDropGateway["claim"] = vi.fn().mockResolvedValue(avatarClaim),
): DailyDropGateway {
  return { status, claim };
}

describe("DailyDropCard", () => {
  it("opens an available drop and announces the awarded item", async () => {
    const claim = vi.fn().mockResolvedValue(avatarClaim);
    render(
      <DailyDropCard
        connected
        gateway={gateway(
          vi.fn().mockResolvedValue({
            state: "available",
            day: "2026-08-24",
            availableCount: 1,
            pendingPlanBoxes: 0,
            nextSource: "daily_check_in",
          }),
          claim,
        )}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Open prize box" }),
    );

    expect(await screen.findByText("Unlocked: Rover the dog")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Unlocked: Rover the dog",
    );
    expect(screen.getByText("Saved for Avatar Studio")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("reuses one idempotency key when a failed claim is retried", async () => {
    const claim = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(avatarClaim);
    render(
      <DailyDropCard
        connected
        gateway={gateway(
          vi.fn().mockResolvedValue({
            state: "available",
            day: "2026-08-24",
            availableCount: 1,
            pendingPlanBoxes: 0,
            nextSource: "daily_check_in",
          }),
          claim,
        )}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Open prize/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Try opening again" }),
    );

    await screen.findByText("Unlocked: Rover the dog");
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls[0]?.[0]).toBe(claim.mock.calls[1]?.[0]);
  });

  it("renders an existing claim as a quiet collected state", async () => {
    render(
      <DailyDropCard
        connected
        gateway={gateway(
          vi.fn().mockResolvedValue({
            state: "claimed",
            day: "2026-08-24",
            availableCount: 0,
            pendingPlanBoxes: 0,
            claim: avatarClaim,
          }),
        )}
      />,
    );

    expect(await screen.findByText("Collected today")).toBeVisible();
    expect(screen.getByText("Rover the dog")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Open prize/i }),
    ).not.toBeInTheDocument();
  });

  it("celebrates a complete collection without offering another claim", async () => {
    render(
      <DailyDropCard
        connected
        gateway={gateway(
          vi.fn().mockResolvedValue({
            state: "collection_complete",
            day: "2026-08-24",
            availableCount: 0,
            pendingPlanBoxes: 0,
          }),
        )}
      />,
    );

    expect(await screen.findByText("Collection complete")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens an earned plan box without consuming the next available box", async () => {
    const planClaim: DailyDropClaim = {
      ...avatarClaim,
      id: "plan-prize-one",
      source: "plan_participation_3",
    };
    const status = vi
      .fn()
      .mockResolvedValueOnce({
        state: "available",
        day: "2026-08-24",
        availableCount: 2,
        pendingPlanBoxes: 1,
        nextSource: "plan_participation_3",
      })
      .mockResolvedValueOnce({
        state: "available",
        day: "2026-08-24",
        availableCount: 1,
        pendingPlanBoxes: 0,
        nextSource: "daily_check_in",
      });
    render(
      <DailyDropCard
        connected
        gateway={gateway(status, vi.fn().mockResolvedValue(planClaim))}
      />,
    );

    expect(
      await screen.findByText(
        "Earned for completing 3 days in your coach plan.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open prize box" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Open another prize box" }),
    );
    expect(await screen.findByText("1 box ready to open")).toBeVisible();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("stays absent when no authenticated backend is connected", async () => {
    const status = vi.fn();
    const { container } = render(
      <DailyDropCard connected={false} gateway={gateway(status)} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(status).not.toHaveBeenCalled();
  });
});
