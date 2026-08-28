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
        rolling30Sessions: 5,
        momentumScore: 34.5,
        currentCheckInStreak: 2,
        currentStreak: 2,
        longestStreak: 3,
        effortPoints: 42,
        activityDays: [],
      },
      teamPulse: {
        activeThisWeek: 2,
        unlocked: true,
        recentActivities: [],
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
      summary: {
        effortPoints: 42,
        momentumScore: 34.5,
        currentCheckInStreak: 2,
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/training-dashboard?teamId=team-real",
      { cache: "no-store" },
    );
  });

  it("records planned rest with a separate idempotent request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "rest-one",
          planId: "plan-one",
          dayIndex: 3,
          occursOn: "2026-08-24",
        }),
        { status: 201 },
      ),
    );

    await createTrainingDashboardGateway(true, "team-real").recordPlannedRest(
      "plan-one",
      3,
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/planned-rest-check-ins",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          teamId: "team-real",
          planId: "plan-one",
          dayIndex: 3,
        }),
      }),
    );
    expect(
      (fetch.mock.calls[0][1]?.headers as Record<string, string>)[
        "Idempotency-Key"
      ],
    ).toBeTruthy();
  });
});
