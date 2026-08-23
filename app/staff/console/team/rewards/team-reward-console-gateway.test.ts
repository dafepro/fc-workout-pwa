import { afterEach, describe, expect, it, vi } from "vitest";

import { createPrototypeReward } from "../../../../data/team-reward-prototype";
import {
  cancelConnectedTeamReward,
  createAndPublishTeamReward,
} from "./team-reward-console-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("staff team reward gateway", () => {
  it("creates the draft before publishing its server id", async () => {
    const draft = createPrototypeReward(
      "team-one",
      new Date("2026-08-23T12:00:00Z"),
    );
    const created = { ...draft, id: "reward-server" };
    const published = {
      ...created,
      status: "active",
      progress: {
        current: 0,
        target: 10,
        percent: 0,
        close: false,
        achieved: false,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse(published, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAndPublishTeamReward("team-one", draft),
    ).resolves.toEqual(published);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/staff/api/backend/v1/staff/teams/team-one/rewards",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/staff/api/backend/v1/staff/teams/team-one/rewards/reward-server/publish",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancels through the staff gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);

    await cancelConnectedTeamReward("team-one", "reward-one");

    expect(fetchMock).toHaveBeenCalledWith(
      "/staff/api/backend/v1/staff/teams/team-one/rewards/reward-one/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function jsonResponse(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
