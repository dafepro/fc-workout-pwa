import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { TeamPulseActivity } from "../domain/types";
import { TeamPulse } from "./TeamPulse";

const activities: TeamPulseActivity[] = [
  ["ava", "Ava", "R", "Hill Sprints", "Today"],
  ["liam", "Liam", "J", "Timed Run / Walk", "Today"],
  ["zoe", "Zoe", "T", "Recovery Walk / Jog", "Yesterday"],
  ["mia", "Mia", "S", "Timed Run / Walk", "Recently"],
  ["noah", "Noah", "K", "Distance Run", "Recently"],
].map(([playerId, firstName, lastInitial, activityName, recency]) => ({
  playerId,
  firstName,
  lastInitial,
  activityName,
  recency: recency as TeamPulseActivity["recency"],
}));

describe("TeamPulse", () => {
  it("keeps teammate identities behind today's completed check-in gate", () => {
    render(
      <TeamPulse
        activeThisWeek={1}
        activities={activities}
        teamId="team-one"
        unlocked={false}
        onSendReaction={vi.fn()}
      />,
    );

    expect(screen.getByText("Check in to open Team pulse")).toBeVisible();
    expect(screen.queryByText("Ava R.")).not.toBeInTheDocument();
  });

  it("shows three safe activities and expands to five", () => {
    render(
      <TeamPulse
        activeThisWeek={5}
        activities={activities}
        teamId="team-one"
        unlocked
        onSendReaction={vi.fn()}
      />,
    );

    const list = screen.getByRole("list", { name: "Recent team activity" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Ava R.")).toBeVisible();
    expect(screen.getByText("Hill Sprints · Today")).toBeVisible();
    expect(screen.queryByText("Mia S.")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show more team activity" }),
    );
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Mia S.")).toBeVisible();
    expect(
      screen.queryByText(/reps|minutes|effort|tired/i),
    ).not.toBeInTheDocument();
  });

  it("sends one predefined private Team-progress cheer", async () => {
    const onSendReaction = vi.fn().mockResolvedValue({
      id: "reaction-one",
      remainingForRecipientWindow: 4,
    });
    render(
      <TeamPulse
        activeThisWeek={1}
        activities={activities.slice(0, 1)}
        teamId="team-one"
        unlocked
        onSendReaction={onSendReaction}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Cheer Ava for Hill Sprints" }),
    );
    await waitFor(() =>
      expect(onSendReaction).toHaveBeenCalledWith("ava", "clap", {
        type: "team_progress",
        teamId: "team-one",
        period: "weekly",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Cheered for Ava" }),
    ).toBeDisabled();
  });
});
