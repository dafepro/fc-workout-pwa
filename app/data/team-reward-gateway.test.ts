import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPlayerTeamReward } from "./team-reward-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("player team reward gateway", () => {
  it("returns no reward for the API empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(loadPlayerTeamReward("team-one")).resolves.toBeNull();
  });

  it("loads only the safe player projection", async () => {
    const reward = {
      id: "reward-one",
      teamId: "team-one",
      status: "active",
      prizeTitle: "Pizza after practice",
      prizeDescription: "Celebrate together.",
      startsOn: "2026-08-23",
      rule: {
        version: 1,
        kind: "qualifying_team_days",
        participationScope: "recommended_workout",
        requiredDays: 10,
        minimumRosterPercent: 80,
      },
      progress: {
        current: 4,
        target: 10,
        percent: 40,
        close: false,
        achieved: false,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(reward), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(loadPlayerTeamReward("team-one")).resolves.toEqual(reward);
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/reward",
      { cache: "no-store" },
    );
  });
});
