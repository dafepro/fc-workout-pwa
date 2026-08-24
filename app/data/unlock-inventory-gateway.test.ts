import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadUnlockInventory,
  markUnlockViewed,
} from "./unlock-inventory-gateway";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("unlock inventory gateway", () => {
  it("loads one requested inventory kind", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    await expect(loadUnlockInventory("avatar_part")).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/unlocks?kind=avatar_part",
      { cache: "no-store" },
    );
  });

  it("acknowledges an item through its encoded identifier", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ viewedAt: "2026-08-24T14:00:00Z" }), {
        status: 200,
      }),
    );
    await markUnlockViewed("avatar-head-dog");
    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/unlocks/avatar-head-dog/viewed",
      { method: "POST" },
    );
  });
});
