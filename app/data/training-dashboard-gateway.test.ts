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
        },
      ],
      currentAssignment: null,
      summary: {
        weeklySessions: 2,
        rolling30Sessions: 5,
        currentStreak: 2,
        longestStreak: 3,
        effortPoints: 42,
        activityDays: [],
      },
      teamPulse: { activeThisWeek: 2 },
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
      activities: [{ id: "hill-sprints", min: 1, max: 20 }],
      summary: { effortPoints: 42 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/training-dashboard?teamId=team-real",
      { cache: "no-store" },
    );
  });
});
