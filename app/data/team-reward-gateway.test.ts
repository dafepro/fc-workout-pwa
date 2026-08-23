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

  it("adds the authenticated immutable thumbnail URL for attached media", async () => {
    const reward = {
      id: "reward-one",
      teamId: "team-one",
      status: "active",
      prizeTitle: "Team picnic",
      prizeDescription: "Celebrate together.",
      startsOn: "2026-08-23",
      mediaId: "media-one",
      imageAlt: "Prize for the team",
      rule: {
        version: 1,
        kind: "qualifying_team_days",
        participationScope: "any_approved_workout",
        requiredDays: 2,
        minimumRosterPercent: 100,
      },
      progress: {
        current: 0,
        target: 2,
        percent: 0,
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

    await expect(loadPlayerTeamReward("team-one")).resolves.toMatchObject({
      mediaId: "media-one",
      imageUrl:
        "/api/zoomigo/v1/teams/team-one/reward-media/media-one?variant=thumbnail",
    });
  });
});
