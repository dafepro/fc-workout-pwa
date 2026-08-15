import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { playerColor } from "../avatar/color";
import type {
  TeamChallengeProjection,
  TeamMemberProjection,
} from "../domain/types";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { TeamChallengeCard } from "./TeamChallengeCard";

afterEach(cleanup);

describe("TeamChallengeCard", () => {
  it("shows the current player's saved avatar and name without another You label", () => {
    const onCheer = vi.fn();
    const { container } = render(
      <AvatarIdentityProvider
        value={{
          currentPlayerID: "player-mason",
          avatarConfig: defaultAvatar(),
        }}
      >
        <TeamChallengeCard
          challenge={challenge}
          members={[mason, ava]}
          currentPlayerID="player-mason"
          onCheer={onCheer}
        />
      </AvatarIdentityProvider>,
    );

    expect(container.querySelector(".avatar--self .avatar-art")).toBeVisible();
    expect(screen.getByText("Mason")).toBeVisible();
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.getByText("AR")).toBeVisible();
  });
});

const challenge: TeamChallengeProjection = {
  id: "challenge-one",
  activityDefinitionId: "hill-sprints",
  activityName: "Hill Sprints",
  targetValue: 8,
  targetUnit: "reps",
  startsOn: "2026-08-10",
  dueOn: "2026-08-16",
  completedCount: 1,
};

const mason = member("player-mason", "Mason", "C.", true);
const ava = member("player-ava", "Ava", "R.", false);

function member(
  id: string,
  firstName: string,
  lastInitial: string,
  challengeCompleted: boolean,
): TeamMemberProjection {
  return {
    id,
    firstName,
    lastInitial,
    initials: `${firstName[0]}${lastInitial[0]}`,
    avatarColor: playerColor(id),
    weeklySessions: 3,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 3,
    consistencyDays: 3,
    goalStatus: "completed",
    challengeCompleted,
  };
}
