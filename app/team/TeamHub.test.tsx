import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TeamHubProjection } from "../domain/types";
import { TeamHub } from "./TeamHub";

const hub: TeamHubProjection = {
  team: {
    id: "team-one",
    name: "Hill Striders",
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
  },
  access: { activityUnlocked: true, loungeUnlocked: true },
  focus: [
    {
      kind: "reward",
      id: "reward-one",
      title: "Team celebration",
      current: 0,
      target: 1,
      unit: "team_days",
      endsOn: "2026-09-03",
    },
    {
      kind: "challenge",
      id: "assignment-one",
      title: "Hill Sprints",
      current: 2,
      target: 12,
      unit: "teammates",
      dueOn: "2026-09-03",
    },
  ],
  activitySummary: { activeThisWeek: 2 },
  activity: [
    {
      player: {
        id: "player-ava",
        firstName: "Ava",
        lastInitial: "R.",
        initials: "AR",
        avatarColor: "#7659d6",
        weeklySessions: 0,
        effortPoints: 0,
        currentStreak: 0,
        consistency: 0,
      },
      signals: [{ kind: "active_today" }, { kind: "challenge_complete" }],
      reactionContext: {
        type: "challenge",
        teamId: "team-one",
        assignmentId: "assignment-one",
      },
    },
  ],
  lounge: { themeId: "beach-boardwalk", title: "Team Lounge" },
};

describe("TeamHub", () => {
  it("renders one clear weekly focus and one action per teammate", () => {
    const onCheer = vi.fn();
    const onOpenLounge = vi.fn();
    render(<TeamHub hub={hub} onCheer={onCheer} onOpenLounge={onOpenLounge} />);

    expect(screen.getByRole("heading", { name: "This week" })).toBeVisible();
    expect(screen.getByText("Team celebration")).toBeVisible();
    expect(screen.getByText("Hill Sprints")).toBeVisible();
    const activity = screen.getByRole("region", {
      name: "Teammate activity",
    });
    expect(within(activity).getAllByText("Ava R.")).toHaveLength(1);
    const cheer = within(activity).getByRole("button", {
      name: "Cheer for Ava R. for Hill Sprints challenge",
    });
    fireEvent.click(cheer);
    expect(onCheer).toHaveBeenCalledWith(hub.activity[0]);
    expect(screen.queryByText(/0 of 3/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 active days in 5/i)).not.toBeInTheDocument();

    const loungePreview = screen.getByRole("region", {
      name: "Team Lounge preview",
    });
    fireEvent.click(
      within(loungePreview).getByRole("button", { name: "Open Lounge" }),
    );
    expect(onOpenLounge).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Open Lounge" })).toHaveLength(
      1,
    );
  });

  it("keeps teammate activity and Lounge private until today's check-in", () => {
    render(
      <TeamHub
        hub={{
          ...hub,
          access: { activityUnlocked: false, loungeUnlocked: false },
          activity: [],
        }}
        onCheer={vi.fn()}
        onOpenLounge={vi.fn()}
      />,
    );

    expect(screen.getByText("Check in to see teammate activity")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Cheer for/i })).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Team Lounge preview" }),
      ).getByRole("button", { name: "Open Lounge" }),
    ).toBeDisabled();
  });
});
