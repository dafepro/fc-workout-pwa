import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareTeamLoungeJoin,
  requestTeamLoungeCredential,
} from "./lounge-gateway";

const response = {
  ticket: "a".repeat(43),
  roomId: "team:team-one:lounge:2026-08-24:v8",
  serverUrl: "https://api.example.test",
  visitorIds: ["player-two"],
  placementCredits: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe("canonical Team Lounge gateway", () => {
  it("accepts one exact weekly room credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(requestTeamLoungeCredential("team-one")).resolves.toEqual({
      ticket: response.ticket,
      roomID: response.roomId,
      serverURL: response.serverUrl,
      visitorIDs: ["player-two"],
      placementCredits: 2,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/lounge/socket-ticket",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
  });

  it("refreshes the single-use ticket without allowing the room to change", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), { status: 201 }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const join = await prepareTeamLoungeJoin("team-one");

    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${response.ticket}`,
    );
    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${response.ticket}`,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
