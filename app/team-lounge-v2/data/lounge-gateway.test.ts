import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareTeamLoungeJoin,
  requestTeamLoungeCredential,
} from "./lounge-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("Team Lounge V2 gateway", () => {
  it("requests a sealed room ticket and validates the exact response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ticket: "a".repeat(43),
          roomId: "team:team-one:lounge:2026-08-24:v2",
          serverUrl: "https://api.example.test",
          expiresInSeconds: 30,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTeamLoungeCredential("team-one")).resolves.toEqual({
      ticket: "a".repeat(43),
      roomID: "team:team-one:lounge:2026-08-24:v2",
      serverURL: "https://api.example.test",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/lounge-v2/socket-ticket",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("fails closed on a malformed room credential", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ticket: "short" }), { status: 201 }),
        ),
    );
    await expect(requestTeamLoungeCredential("team-one")).rejects.toThrow(
      /unavailable/i,
    );
  });

  it("refreshes one-time tickets for reconnect without changing rooms", async () => {
    const replies = ["a", "b"].map((ticket) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ticket: ticket.repeat(43),
            roomId: "team:team-one:lounge:2026-08-24:v2",
            serverUrl: "https://api.example.test",
          }),
          { status: 201 },
        ),
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => replies.shift()),
    );

    const join = await prepareTeamLoungeJoin("team-one");
    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${"a".repeat(43)}`,
    );
    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${"b".repeat(43)}`,
    );
  });
});
