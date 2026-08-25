import { afterEach, describe, expect, it, vi } from "vitest";

import { claimDailyDrop, loadDailyDropStatus } from "./daily-drop-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("Daily Drop gateway", () => {
  it("loads today's authenticated status without caching it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          state: "available",
          day: "2026-08-24",
          availableCount: 3,
          pendingPlanBoxes: 2,
          nextSource: "plan_participation_3",
        }),
      ),
    );

    await expect(loadDailyDropStatus()).resolves.toEqual({
      state: "available",
      day: "2026-08-24",
      availableCount: 3,
      pendingPlanBoxes: 2,
      nextSource: "plan_participation_3",
    });
    expect(fetch).toHaveBeenCalledWith("/api/zoomigo/v1/me/daily-drop", {
      cache: "no-store",
    });
  });

  it("claims with the caller-owned idempotency key", async () => {
    const claim = {
      id: "daily-drop-one",
      state: "claimed",
      source: "daily_check_in",
      day: "2026-08-24",
      timeZone: "America/Chicago",
      claimedAt: "2026-08-24T12:00:00Z",
      item: {
        id: "avatar-head-dog",
        kind: "avatar_part",
        slot: "head",
        assetId: "dog",
        label: "Rover the dog",
        catalogVersion: 1,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ claim }, { status: 201 })),
    );

    await expect(claimDailyDrop("stable-key")).resolves.toEqual(claim);
    expect(fetch).toHaveBeenCalledWith("/api/zoomigo/v1/me/daily-drop/claim", {
      method: "POST",
      headers: { "Idempotency-Key": "stable-key" },
    });
  });

  it("rejects an invalid server projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ state: "claimed", day: "not-a-day" }),
        ),
    );

    await expect(loadDailyDropStatus()).rejects.toThrow(
      "The daily gift response was invalid.",
    );
  });
});
