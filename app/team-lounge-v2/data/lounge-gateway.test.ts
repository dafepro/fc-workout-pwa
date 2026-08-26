import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareTeamLoungeJoin,
  requestTeamLoungeAccess,
  requestTeamLoungeCredential,
} from "./lounge-gateway";

const placeableStamps = [
  {
    assetId: "bolt",
    label: "Bolt",
    source: "included",
    isNew: false,
  },
  {
    assetId: "target",
    label: "Target stamp",
    source: "earned",
    unlockId: "canvas-stamp-target",
    isNew: true,
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("Team Lounge V2 gateway", () => {
  it("requests a sealed room ticket and validates the exact response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ticket: "a".repeat(43),
          roomId: "team:team-one:lounge:2026-08-24:v3",
          serverUrl: "https://api.example.test",
          expiresInSeconds: 30,
          visitorIds: ["player-two"],
          placementCredits: 2,
          placementDay: "2026-08-26",
          placeableStamps,
          theme: {
            id: "beach-boardwalk",
            version: 1,
            name: "Beach Boardwalk",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTeamLoungeCredential("team-one")).resolves.toEqual({
      ticket: "a".repeat(43),
      roomID: "team:team-one:lounge:2026-08-24:v3",
      serverURL: "https://api.example.test",
      visitorIDs: ["player-two"],
      placementCredits: 2,
      placementDay: "2026-08-26",
      placeableStamps,
      theme: {
        id: "beach-boardwalk",
        version: 1,
        name: "Beach Boardwalk",
      },
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
            roomId: "team:team-one:lounge:2026-08-24:v3",
            serverUrl: "https://api.example.test",
            visitorIds: ["player-two"],
            placementCredits: 2,
            placementDay: "2026-08-26",
            placeableStamps,
            theme: {
              id: "beach-boardwalk",
              version: 1,
              name: "Beach Boardwalk",
            },
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
    expect(join.visitorIDs).toEqual(["player-two"]);
    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${"a".repeat(43)}`,
    );
    await expect(join.credentialProvider()).resolves.toBe(
      `ticket.${"b".repeat(43)}`,
    );
  });

  it("refreshes the authoritative placeable collection without minting a socket ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "team:team-one:lounge:2026-08-24:v3",
          placementCredits: 2,
          placementDay: "2026-08-26",
          placeableStamps: [placeableStamps[0]],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTeamLoungeAccess("team-one")).resolves.toEqual({
      roomID: "team:team-one:lounge:2026-08-24:v3",
      placementCredits: 2,
      placementDay: "2026-08-26",
      placeableStamps: [placeableStamps[0]],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/lounge-v2/access",
      { cache: "no-store" },
    );
  });

  it("fails closed when the server projects a duplicate or malformed placeable stamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ticket: "a".repeat(43),
            roomId: "team:team-one:lounge:2026-08-24:v3",
            serverUrl: "https://api.example.test",
            visitorIds: [],
            placementCredits: 1,
            placementDay: "2026-08-26",
            placeableStamps: [placeableStamps[0], placeableStamps[0]],
            theme: {
              id: "beach-boardwalk",
              version: 1,
              name: "Beach Boardwalk",
            },
          }),
          { status: 201 },
        ),
      ),
    );

    await expect(requestTeamLoungeCredential("team-one")).rejects.toThrow(
      /unavailable/i,
    );
  });
});
