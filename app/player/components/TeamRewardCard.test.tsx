import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createPrototypeReward } from "../../data/team-reward-prototype";
import { TeamRewardCard } from "./TeamRewardCard";

describe("TeamRewardCard", () => {
  it("shows only safe aggregate progress and plain-language criteria", () => {
    const reward = {
      ...createPrototypeReward("team-1", new Date("2026-08-23T12:00:00Z")),
      prizeTitle: "Pizza after practice",
      status: "active" as const,
    };

    render(
      <TeamRewardCard
        reward={reward}
        progress={{
          current: 4,
          target: 10,
          percent: 40,
          contributionPercent: 55,
          started: 6,
          close: false,
          achieved: false,
          days: [],
          units: Array.from({ length: 10 }, (_, index) => ({
            current: index < 4 ? 1 : index < 6 ? 0.5 : 0,
            target: 1,
            complete: index < 4,
          })),
        }}
        placement="team"
      />,
    );

    expect(screen.getByText("Pizza after practice")).toBeInTheDocument();
    expect(screen.getByText("4 of 10 team days")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Team contribution: 55%" }),
    ).toHaveAttribute("aria-valuenow", "55");
    expect(screen.queryByText(/player/i)).not.toBeInTheDocument();
  });

  it("shows anonymous partial progress for each teammate before anyone finishes", () => {
    const reward = {
      ...createPrototypeReward("team-1", new Date("2026-08-23T12:00:00Z")),
      id: "consistency",
      status: "active" as const,
      rule: {
        version: 1 as const,
        kind: "teammate_consistency" as const,
        requiredPlayers: 2,
        requiredDaysPerPlayer: 10,
        participationScope: "any_approved_workout" as const,
      },
    };

    render(
      <TeamRewardCard
        reward={reward}
        progress={{
          current: 0,
          target: 2,
          percent: 0,
          contributionPercent: 65,
          started: 2,
          close: false,
          achieved: false,
          days: [],
          units: [
            { current: 9, target: 10, complete: false },
            { current: 4, target: 10, complete: false },
          ],
        }}
        placement="team"
      />,
    );

    expect(screen.getByText("0 of 2 teammates")).toBeInTheDocument();
    expect(
      screen.getByText("2 teammates are building progress."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Teammate 1: 9 of 10 days" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Teammate 2: 4 of 10 days" }),
    ).toBeInTheDocument();
    expect(screen.getByText("9/10")).toBeInTheDocument();
    expect(screen.getByText("4/10")).toBeInTheDocument();
    expect(screen.queryByText(/p1|p2/i)).not.toBeInTheDocument();
  });
});
