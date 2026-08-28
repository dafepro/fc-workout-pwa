import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareTeamLoungeJoin,
  requestTeamLoungeItemMutationPermit,
  reserveTeamLoungePlacement,
  requestTeamLoungeCredential,
} from "./lounge-gateway";

const response = {
  ticket: "a".repeat(43),
  roomId: "team:team-one:lounge:2026-08-24:v10",
  serverUrl: "https://api.example.test",
  visitorIds: ["player-two"],
  placementCredits: 2,
  editableItemIds: ["canvas-item-one"],
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
      editableItemIDs: ["canvas-item-one"],
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

  it("reserves a Canvas-authorized placement permit through ZoomiGo", async () => {
    const placementID = `lounge-placement-${"a".repeat(32)}`;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            placementId: placementID,
            definitionId: "zoomigo-stamp-bolt",
            definitionVersion: 1,
            permit: "p".repeat(43),
            x: 40,
            y: 70,
            remainingPlacements: 0,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);

    await expect(
      reserveTeamLoungePlacement(
        "team-one",
        response.roomId,
        "zoomigo-stamp-bolt",
        1,
        { x: 40, y: 70 },
        "placement-key",
      ),
    ).resolves.toEqual({
      placementID,
      permit: "p".repeat(43),
      definitionVersion: 1,
      position: { x: 40, y: 70 },
      remaining: 0,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/zoomigo/v1/teams/team-one/lounge/placements",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "placement-key",
        }),
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requests an exact owner-bound rotation permit before Canvas mutates", async () => {
    const mutationPermitID = `lounge-mutation-${"b".repeat(32)}`;
    const transform = { x: 20, y: 70, rotation: 0.5, scale: 1 };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mutationPermitId: mutationPermitID,
          entityId: "canvas-item-one",
          itemRevision: 3,
          kind: "rotation",
          transform,
          permit: "m".repeat(43),
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      requestTeamLoungeItemMutationPermit(
        "team-one",
        response.roomId,
        "canvas-item-one",
        3,
        "rotation",
        transform,
        "rotate-item-one",
      ),
    ).resolves.toEqual({
      mutationPermitID,
      entityID: "canvas-item-one",
      itemRevision: 3,
      kind: "rotation",
      transform,
      permit: "m".repeat(43),
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/zoomigo/v1/teams/team-one/lounge/items/canvas-item-one/mutation-permits",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "rotate-item-one",
        }),
        body: JSON.stringify({
          roomId: response.roomId,
          itemRevision: 3,
          kind: "rotation",
          transform,
        }),
      }),
    );
  });
});
