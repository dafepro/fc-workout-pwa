import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeamRewardGateway } from "./team-reward-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected Team Reward gateway", () => {
  it("loads the current aggregate reward without caching", async () => {
    const reward = {
      id: "reward-one",
      teamId: "team-one",
      definitionId: "team-celebration-v1",
      definitionVersion: 1,
      title: "Team celebration",
      description: "Celebrate together at a future team gathering.",
      artworkId: "celebration-stars",
      status: "active",
      startsOn: "2026-08-20",
      endsOn: "2026-08-24",
      timeZone: "UTC",
      rule: { version: 1, requiredDays: 3, minimumRosterPercent: 80 },
      progress: {
        current: 2,
        target: 3,
        percent: 67,
        achieved: false,
        days: [],
      },
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-22T00:00:00Z",
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(reward));
    vi.stubGlobal("fetch", fetch);

    await expect(
      createTeamRewardGateway(true, "team-one").current(),
    ).resolves.toEqual(reward);
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/team-reward",
      { cache: "no-store" },
    );
  });

  it("treats an absent reward as an empty optional section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(
      createTeamRewardGateway(true, "team-one").current(),
    ).resolves.toBeNull();
  });

  it("keeps other failures distinct from an absent reward", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "not_ready", message: "Try later." } },
            { status: 503 },
          ),
        ),
    );
    await expect(
      createTeamRewardGateway(true, "team-one").current(),
    ).rejects.toMatchObject({
      code: "not_ready",
      message: "Try later.",
    });
  });
});

describe("local Team Reward gateway", () => {
  it("does not invent a reward when disconnected", async () => {
    await expect(
      createTeamRewardGateway(false, "team-one").current(),
    ).resolves.toBeNull();
  });
});
