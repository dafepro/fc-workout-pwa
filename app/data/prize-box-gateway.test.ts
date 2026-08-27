import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrizeBoxGateway } from "./prize-box-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected Prize Box gateway", () => {
  it("reads the consolidated overview without legacy reveal fields", async () => {
    const overview = {
      day: "2026-08-27",
      dailyState: "available",
      readyCount: 1,
      earnedTotal: 2,
      openedTotal: 1,
      unopened: [
        {
          id: "prize_box_1234",
          source: "plan_participation_3",
          earnedAt: "2026-08-27T12:00:00Z",
        },
      ],
      recent: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(overview));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPrizeBoxGateway(true).overview()).resolves.toEqual(
      overview,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/prize-boxes",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("claims and opens sealed boxes with caller-owned idempotency keys", async () => {
    const box = {
      id: "prize_box_1234",
      source: "daily_check_in",
      earnedAt: "2026-08-27T12:00:00Z",
    } as const;
    const item = {
      id: "avatar-head-dog",
      kind: "avatar_part",
      slot: "head",
      assetId: "dog",
      label: "Rover the dog",
      catalogVersion: 1,
      rarity: "common",
      destination: "avatar",
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ box }, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json(
          {
            claim: {
              id: box.id,
              source: box.source,
              item,
              openedAt: box.earnedAt,
            },
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createPrizeBoxGateway(true);

    await expect(gateway.claimDaily("claim-key")).resolves.toEqual(box);
    await expect(gateway.open(box.id, "open-key")).resolves.toMatchObject({
      id: box.id,
      item,
    });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "Idempotency-Key": "claim-key",
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/zoomigo/v1/me/prize-boxes/prize_box_1234/open",
    );
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      "Idempotency-Key": "open-key",
    });
  });

  it("combines only the three final inventory kinds", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await createPrizeBoxGateway(true).inventory();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/zoomigo/v1/me/unlocks?kind=avatar_part",
      "/api/zoomigo/v1/me/unlocks?kind=lounge_stamp",
      "/api/zoomigo/v1/me/unlocks?kind=lounge_prop",
    ]);
  });

  it("loads one destination and marks an owned item viewed", async () => {
    const item = {
      item: {
        id: "avatar-head-dog",
        kind: "avatar_part",
        slot: "head",
        assetId: "dog",
        label: "Rover the dog",
        catalogVersion: 1,
        rarity: "common",
        destination: "avatar",
      },
      source: "daily_check_in",
      unlockedAt: "2026-08-27T12:00:00Z",
      viewedAt: "2026-08-27T12:01:00Z",
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [item] }))
      .mockResolvedValueOnce(Response.json(item));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createPrizeBoxGateway(true);

    await expect(gateway.inventory(["avatar_part"])).resolves.toEqual([item]);
    await expect(gateway.markViewed(item.item.id)).resolves.toEqual(item);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/zoomigo/v1/me/unlocks?kind=avatar_part",
      "/api/zoomigo/v1/me/unlocks/avatar-head-dog/viewed",
    ]);
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });
});
