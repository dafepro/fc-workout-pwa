import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PlayerUnlock } from "../data/unlock-inventory-gateway";
import { PrizeCollection } from "./PrizeCollection";

const prizes: PlayerUnlock[] = [
  {
    item: {
      id: "canvas-prop-beach-ball",
      kind: "canvas_prop",
      slot: "prop",
      assetId: "beach-ball",
      label: "Beach ball",
      catalogVersion: 1,
      rarity: "uncommon",
      destination: "team_lounge",
    },
    source: "daily_drop",
    unlockedAt: "2026-08-26T12:00:00Z",
  },
  {
    item: {
      id: "stamp-lion",
      kind: "canvas_stamp",
      slot: "stamp",
      assetId: "lion",
      label: "Lion stamp",
      catalogVersion: 1,
      rarity: "epic",
      destination: "team_lounge",
    },
    source: "daily_drop",
    unlockedAt: "2026-08-25T12:00:00Z",
  },
  {
    item: {
      id: "avatar-fox",
      kind: "avatar_part",
      slot: "head",
      assetId: "fox",
      label: "Fox head",
      catalogVersion: 1,
      rarity: "uncommon",
      destination: "avatar",
    },
    source: "plan_participation_3",
    unlockedAt: "2026-08-24T12:00:00Z",
  },
];

describe("PrizeCollection", () => {
  it("shows actual prizes and filters by where they can be used", async () => {
    render(
      <PrizeCollection connected gateway={{ load: async () => prizes }} />,
    );

    expect(await screen.findByText("Lion stamp")).toBeInTheDocument();
    expect(screen.getByText("Beach ball")).toBeInTheDocument();
    expect(screen.getByText("Fox head")).toBeInTheDocument();
    expect(screen.getByText("Epic")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Team Lounge" }));
    expect(screen.getByText("Lion stamp")).toBeInTheDocument();
    expect(screen.getByText("Beach ball")).toBeInTheDocument();
    expect(screen.queryByText("Fox head")).not.toBeInTheDocument();
  });

  it("separates collection from chronological earning history", async () => {
    render(
      <PrizeCollection connected gateway={{ load: async () => prizes }} />,
    );
    await screen.findByText("Lion stamp");
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getAllByText("From daily box")).not.toHaveLength(0);
    expect(
      screen.getByText("From 3-day plan participation"),
    ).toBeInTheDocument();
  });
});
