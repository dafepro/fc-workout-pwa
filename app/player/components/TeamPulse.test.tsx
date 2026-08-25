import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { TeamPulseActivity } from "../../domain/types";
import { TeamPulse } from "./TeamPulse";

const activities: TeamPulseActivity[] = [
  {
    playerId: "ava",
    firstName: "Ava",
    lastInitial: "R",
    activityName: "Hill Sprints",
    recency: "Today",
  },
  {
    playerId: "liam",
    firstName: "Liam",
    lastInitial: "J",
    activityName: "Ball touches",
    recency: "Today",
  },
  {
    playerId: "zoe",
    firstName: "Zoe",
    lastInitial: "T",
    activityName: "Recovery Walk",
    recency: "Yesterday",
  },
  {
    playerId: "mia",
    firstName: "Mia",
    lastInitial: "S",
    activityName: "Timed Run / Walk",
    recency: "Recently",
  },
  {
    playerId: "noah",
    firstName: "Noah",
    lastInitial: "K",
    activityName: "Distance Run",
    recency: "Recently",
  },
  {
    playerId: "ethan",
    firstName: "Ethan",
    lastInitial: "M",
    activityName: "Hill Sprints",
    recency: "Recently",
  },
];

describe("TeamPulse", () => {
  it("keeps teammate identities behind today's participation gate", () => {
    render(
      <TeamPulse
        activeThisWeek={6}
        activities={activities}
        teamId="team-one"
        unlocked={false}
        onSendReaction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Team pulse unlocks after today’s check-in."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ava R.")).not.toBeInTheDocument();
  });

  it("starts with three safe activities and expands to the five-entry feed", () => {
    render(
      <TeamPulse
        activeThisWeek={6}
        activities={activities}
        teamId="team-one"
        unlocked
        onSendReaction={vi.fn()}
      />,
    );

    const list = screen.getByRole("list", { name: "Recent team activity" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Ava R.")).toBeInTheDocument();
    expect(screen.getByText("Hill Sprints · Today")).toBeInTheDocument();
    expect(screen.queryByText("Mia S.")).not.toBeInTheDocument();
    const showMore = screen.getByRole("button", {
      name: "Show more team activity",
    });
    expect(showMore).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showMore);

    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Mia S.")).toBeInTheDocument();
    expect(screen.queryByText("Ethan M.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show less team activity" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.queryByText(/reps|minutes|effort|tired/i),
    ).not.toBeInTheDocument();
  });

  it("sends a private predefined Team-progress cheer and confirms it", async () => {
    const onSendReaction = vi.fn().mockResolvedValue({
      id: "reaction-one",
      remainingForRecipientWindow: 4,
    });
    render(
      <TeamPulse
        activeThisWeek={6}
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

  it("keeps a failed cheer retryable", async () => {
    const onSendReaction = vi
      .fn()
      .mockRejectedValue(new Error("Cheer limit reached."));
    render(
      <TeamPulse
        activeThisWeek={6}
        activities={activities.slice(0, 1)}
        teamId="team-one"
        unlocked
        onSendReaction={onSendReaction}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Cheer Ava for Hill Sprints" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cheer limit reached.",
    );
    expect(
      screen.getByRole("button", { name: "Cheer Ava for Hill Sprints" }),
    ).toBeEnabled();
  });

  it("explains an unlocked feed with no recent activity", () => {
    render(
      <TeamPulse
        activeThisWeek={0}
        activities={[]}
        teamId="team-one"
        unlocked
        onSendReaction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Your team’s next check-in will show here."),
    ).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
