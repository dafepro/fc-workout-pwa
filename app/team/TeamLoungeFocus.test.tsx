import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player, TeamActivityProjection } from "../domain/types";
import { TeamLoungeFocus } from "./TeamLoungeFocus";

const mocks = vi.hoisted(() => ({
  teamActivity: vi.fn<() => Promise<TeamActivityProjection>>(),
}));

vi.mock("../state/auth-context", () => ({
  useAuth: () => ({
    connected: true,
    runtime: {
      social: () => ({ teamActivity: mocks.teamActivity }),
    },
  }),
}));

vi.mock("../team-lounge/TeamLounge", () => ({
  TeamLounge: ({ unlocked }: { unlocked: boolean }) => (
    <div data-testid="lounge">{unlocked ? "unlocked" : "locked"}</div>
  ),
}));

const player: Player = {
  id: "player-mason",
  firstName: "Mason",
  lastInitial: "B.",
  initials: "MB",
  avatarColor: "#7659d6",
  weeklySessions: 0,
  effortPoints: 0,
  currentStreak: 0,
  consistency: 0,
};

describe("TeamLoungeFocus", () => {
  beforeEach(() => mocks.teamActivity.mockReset());

  it("does not request the full roster while Lounge access is locked", async () => {
    render(
      <TeamLoungeFocus
        player={player}
        teamID="team-one"
        unlocked={false}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("lounge")).toHaveTextContent("locked");
    expect(mocks.teamActivity).not.toHaveBeenCalled();
  });

  it("loads the full roster only for an unlocked Lounge", async () => {
    mocks.teamActivity.mockResolvedValue({
      team: { id: "team-one", name: "Hill Striders", weeklyGoal: 3 },
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
      teamSessions: 0,
      membersMeetingGoal: 0,
      currentChallenge: null,
      members: [],
    });

    render(
      <TeamLoungeFocus
        player={player}
        teamID="team-one"
        unlocked
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.teamActivity).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("lounge")).toHaveTextContent("unlocked");
  });
});
