import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PrizeUnlock } from "../data/prize-box-gateway";
import { PrizeCollection } from "./PrizeCollection";

const prizes: PrizeUnlock[] = [
  {
    item: {
      id: "lounge-prop-beach-ball",
      kind: "lounge_prop",
      slot: "prop",
      assetId: "beach-ball",
      label: "Beach ball",
      catalogVersion: 1,
      rarity: "uncommon",
      destination: "team_lounge",
    },
    source: "daily_check_in",
    unlockedAt: "2026-08-27T12:00:00Z",
  },
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
    source: "plan_participation_3",
    unlockedAt: "2026-08-26T12:00:00Z",
    viewedAt: "2026-08-26T12:10:00Z",
  },
];

describe("PrizeCollection", () => {
  it("filters owned prizes and switches to chronological history", () => {
    render(
      <PrizeCollection
        inventory={prizes}
        status="ready"
        onRetry={vi.fn()}
        onMarkViewed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Avatar" }));
    expect(screen.getByText("Rover the dog")).toBeInTheDocument();
    expect(screen.queryByText("Beach ball")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("From 3-day plan box")).toBeInTheDocument();
  });

  it("keeps an unviewed prize owned and marked New when markViewed fails", async () => {
    const onMarkViewed = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <PrizeCollection
        inventory={[prizes[0]]}
        status="ready"
        onRetry={vi.fn()}
        onMarkViewed={onMarkViewed}
      />,
    );

    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "View Beach ball" }));

    expect(
      await screen.findByRole("dialog", { name: "Beach ball" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "still in your collection",
    );
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beach ball").length).toBeGreaterThan(0);
  });

  it("shows partial unknown artwork and a retryable inventory failure", async () => {
    const unknown = {
      ...prizes[0],
      item: {
        ...prizes[0].item,
        id: "future-prize",
        assetId: "future-art",
        label: "Future prize",
      },
    };
    const onRetry = vi.fn();
    render(
      <PrizeCollection
        inventory={[unknown]}
        status="error"
        onRetry={onRetry}
        onMarkViewed={vi.fn()}
      />,
    );

    expect(screen.getByText("Future prize")).toBeInTheDocument();
    expect(document.querySelector("[data-prize-art-missing]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry collection" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
