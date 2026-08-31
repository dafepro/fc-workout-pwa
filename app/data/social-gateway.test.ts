import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectedSocialGateway } from "./social-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected social gateway", () => {
  it("loads and maps the authoritative Team projection", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        team: { id: "team-one", name: "Trailblazers", weeklyGoal: 3 },
        weekStart: "2026-08-10",
        weekEnd: "2026-08-16",
        teamSessions: 3,
        membersMeetingGoal: 1,
        currentChallenge: {
          id: "assignment-hills",
          activityDefinitionId: "hill-sprints",
          activityName: "Hill Sprints",
          targetValue: 8,
          targetUnit: "reps",
          startsOn: "2026-08-10",
          dueOn: "2026-08-16",
          completedCount: 1,
        },
        members: [
          {
            playerId: "player-ava",
            firstName: "Ava",
            lastInitial: "R",
            weeklySessions: 3,
            effortPoints: 28,
            currentStreak: 2,
            consistencyDays: 2,
            goalStatus: "completed",
            challengeCompleted: true,
            avatarConfiguration: {
              version: "5",
              head: "cheetah",
              effect: "orbit",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result =
      await createConnectedSocialGateway("team-one").teamActivity();

    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/activity",
      { cache: "no-store" },
    );
    expect(result.members[0]).toMatchObject({
      id: "player-ava",
      lastInitial: "R.",
      initials: "AR",
      goalStatus: "completed",
      challengeCompleted: true,
      avatarConfiguration: expect.objectContaining({
        version: "5",
        head: "cheetah",
        effect: "orbit",
      }),
    });
    expect(result.currentChallenge).toMatchObject({
      activityName: "Hill Sprints",
      completedCount: 1,
    });
  });
});
