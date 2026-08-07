import { afterEach, describe, expect, it, vi } from "vitest";
import { createSocialGateway } from "./social-gateway";

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
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await createSocialGateway(true, "team-one").teamActivity();

    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/activity",
      { cache: "no-store" },
    );
    expect(result.members[0]).toMatchObject({
      id: "player-ava",
      lastInitial: "R.",
      initials: "AR",
      goalStatus: "completed",
    });
  });

  it("requests the selected safe leaderboard and preserves server rank", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        team: { id: "team-one", name: "Trailblazers", weeklyGoal: 3 },
        period: "thirty_days",
        metric: "consistency",
        periodStart: "2026-07-14",
        periodEnd: "2026-08-12",
        teamSessions: 4,
        teamEffortPoints: 43,
        items: [
          {
            rank: 1,
            playerId: "player-ava",
            firstName: "Ava",
            lastInitial: "R",
            value: 2,
            effortPoints: 28,
            sessions: 3,
            streakDays: 2,
            consistencyDays: 2,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await createSocialGateway(true, "team-one").leaderboard(
      "thirty_days",
      "consistency",
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/leaderboards?period=thirty_days&metric=consistency",
      { cache: "no-store" },
    );
    expect(result.items[0]).toMatchObject({
      id: "player-ava",
      rank: 1,
      value: 2,
    });
  });
});
