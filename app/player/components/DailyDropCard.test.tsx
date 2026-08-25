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
          }),
        )}
      />,
    );

    expect(await screen.findByText("Collection complete")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
