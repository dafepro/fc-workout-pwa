import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimDailyPrizeBox,
  loadPrizeBoxOverview,
  openPrizeBox,
} from "./prize-box-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("prize box gateway", () => {
  it("loads the unopened pool and recent collection", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        day: "2026-08-25",
        dailyState: "available",
        readyCount: 1,
        earnedTotal: 4,
        openedTotal: 3,
        unopened: [
          {
            id: "plan-prize-one",
            state: "unopened",
            source: "plan_participation_3",
            earnedAt: "2026-08-25T12:00:00Z",
          },
        ],
        recent: [],
      }),
    });
    vi.stubGlobal("fetch", fetch);

    await expect(loadPrizeBoxOverview()).resolves.toMatchObject({
      dailyState: "available",
      readyCount: 1,
    });
    expect(fetch).toHaveBeenCalledWith("/api/zoomigo/v1/me/prize-boxes", {
      cache: "no-store",
    });
  });

  it("uses separate idempotent claim and open routes", async () => {
    const item = {
      id: "canvas-stamp-lion",
      kind: "canvas_stamp",
      slot: "stamp",
      assetId: "lion",
      label: "Lion stamp",
      catalogVersion: 1,
      rarity: "epic",
      destination: "team_lounge",
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          box: {
            id: "daily-drop-one",
            state: "unopened",
            source: "daily_check_in",
            earnedAt: "2026-08-25T12:00:00Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          claim: {
            id: "daily-drop-one",
            state: "claimed",
            source: "daily_check_in",
            day: "2026-08-25",
            timeZone: "America/Chicago",
            item,
            claimedAt: "2026-08-25T12:01:00Z",
          },
        }),
      });
    vi.stubGlobal("fetch", fetch);

    await claimDailyPrizeBox("claim-key");
    await expect(
      openPrizeBox("daily-drop-one", "open-key"),
    ).resolves.toMatchObject({ item });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/zoomigo/v1/me/prize-boxes/claim-daily",
      { method: "POST", headers: { "Idempotency-Key": "claim-key" } },
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/zoomigo/v1/me/prize-boxes/daily-drop-one/open",
      { method: "POST", headers: { "Idempotency-Key": "open-key" } },
    );
  });
});
