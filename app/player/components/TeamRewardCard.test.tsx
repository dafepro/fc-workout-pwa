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
          close: false,
          achieved: false,
          days: [],
        }}
        placement="team"
      />,
    );

    expect(screen.getByText("Pizza after practice")).toBeInTheDocument();
    expect(screen.getByText("4 of 10 team days")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
    expect(screen.queryByText(/player/i)).not.toBeInTheDocument();
  });
});
