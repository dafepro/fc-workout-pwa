import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type { TeamRewardProjection } from "../domain/types";
import { TeamRewardCard } from "./TeamRewardCard";

const reward: TeamRewardProjection = {
  id: "reward-one",
  teamId: "team-one",
  definitionId: "team-celebration-v1",
  definitionVersion: 1,
  title: "Team celebration",
  description: "Celebrate together at a future team gathering.",
  artworkId: "celebration-stars",
  status: "active",
  startsOn: "2026-08-20",
  endsOn: "2026-08-24",
  timeZone: "UTC",
  rule: { version: 1, requiredDays: 3, minimumRosterPercent: 80 },
  progress: { current: 2, target: 3, percent: 67, achieved: false, days: [] },
  createdAt: "2026-08-20T00:00:00Z",
  updatedAt: "2026-08-22T00:00:00Z",
};

describe("TeamRewardCard", () => {
  it("shows one aggregate view without player contribution details", () => {
    render(<TeamRewardCard reward={reward} />);

    expect(
      screen.getByRole("heading", { name: "Team celebration" }),
    ).toBeVisible();
    expect(screen.getByText("2 of 3 team days")).toBeVisible();
    expect(screen.getByText("Through Aug 24")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "Team reward progress" }),
    ).toHaveAttribute("aria-valuenow", "2");
    expect(
      screen.queryByText(/player|reps|effort|tired/i),
    ).not.toBeInTheDocument();
  });

  it("celebrates the achieved state without offering another view", () => {
    render(
      <TeamRewardCard
        reward={{
          ...reward,
          status: "achieved",
          achievedAt: "2026-08-23T12:00:00Z",
          progress: {
            ...reward.progress,
            current: 3,
            percent: 100,
            achieved: true,
          },
        }}
      />,
    );

    expect(screen.getByText("Unlocked together!")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
