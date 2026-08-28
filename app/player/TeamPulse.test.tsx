import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type { TeamPulseActivity } from "../domain/types";
import { TeamPulse } from "./TeamPulse";

const activity: TeamPulseActivity = {
  firstName: "Ava",
  lastInitial: "R",
  activityName: "Hill Sprints",
  recency: "Today",
};

describe("TeamPulse", () => {
  it("keeps teammate identities behind today's completed check-in gate", () => {
    render(
      <TeamPulse
        projection={{
          activeThisWeek: 1,
          unlocked: false,
          recentActivities: [activity],
        }}
      />,
    );

    expect(screen.getByText("Check in to open Team pulse")).toBeVisible();
    expect(screen.queryByText("Ava R.")).not.toBeInTheDocument();
  });

  it("shows only privacy-safe activity and broad recency after unlock", () => {
    render(
      <TeamPulse
        projection={{
          activeThisWeek: 2,
          unlocked: true,
          recentActivities: [activity],
        }}
      />,
    );

    expect(screen.getByText("2 players checked in this week")).toBeVisible();
    expect(screen.getByText("Ava R.")).toBeVisible();
    expect(screen.getByText("Hill Sprints · Today")).toBeVisible();
    expect(
      screen.queryByText(/reps|minutes|effort|tired/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team activity" })).toHaveAttribute(
      "href",
      "/team",
    );
  });
});
