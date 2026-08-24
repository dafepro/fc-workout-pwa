import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrainingDashboardGateway } from "./training-dashboard-gateway";

describe("connected training dashboard gateway", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads server-owned dashboard data without prototype imports", async () => {
    const response = {
      team: { id: "team-real", name: "Trailblazers", weeklyGoal: 4 },
      activities: [
        {
          id: "hill-sprints",
          name: "Hill Sprints",
          inputKind: "repetitions",
          unit: "reps",
          minimumValue: 1,
          maximumValue: 20,
          stepValue: 1,
          defaultValue: 8,
        },
      ],
      currentAssignment: null,
      summary: {
        weeklySessions: 2,
        weeklyMomentumCredits: 2,
        momentumScore: 34,
        rolling30Sessions: 5,
        currentStreak: 2,
        currentCheckInStreak: 3,
        longestStreak: 3,
        effortPoints: 42,
        activityDays: [],
      },
      teamPulse: {
        activeThisWeek: 2,
        unlocked: true,
        recentActivities: [
          {
            playerId: "player-ava",
            firstName: "Ava",
            lastInitial: "R",
            activityName: "Hill Sprints",
            recency: "Today",
          },
        ],
      },
      streakComparison: {
        templateKey: "hammerhead_sharks",
        value: "26",
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    await expect(
      createTrainingDashboardGateway(true, "team-real").get(),
    ).resolves.toMatchObject({
      team: { id: "team-real", weeklyGoal: 4 },
      activities: [{ id: "hill-sprints", min: 1, max: 20, defaultValue: 8 }],
      summary: { effortPoints: 42 },
      teamPulse: {
        recentActivities: [{ playerId: "player-ava", recency: "Today" }],
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/training-dashboard?teamId=team-real",
      { cache: "no-store" },
    );
  });
});
