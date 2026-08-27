import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("consoleRequest", () => {
  it("forwards an idempotency key on a mutating staff request", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "reward-1" }));
    vi.stubGlobal("fetch", fetch);

    await consoleRequest("v1/staff/teams/team-1/team-reward", {
      method: "POST",
      idempotencyKey: "publish-reward-1",
      body: { definitionId: "team-celebration-v1" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "/staff/api/backend/v1/staff/teams/team-1/team-reward",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "publish-reward-1",
        },
      }),
    );
  });
});
