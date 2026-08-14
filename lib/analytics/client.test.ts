import { describe, expect, it, vi } from "vitest";
import { createAnalyticsClient } from "./client";

describe("analytics client", () => {
  it("provides one typed queue for automatic and ad hoc events", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = createAnalyticsClient({
      enabled: true,
      send,
      now: () => new Date("2026-08-11T18:00:00.000Z"),
      uuid: () => "123e4567-e89b-42d3-a456-426614174000",
      visitId: "123e4567-e89b-42d3-a456-426614174001",
    });

    client.track("route_summary", {
      route: "home",
      active_ms: 1_200,
      views: 1,
    });
    await client.flush();

    expect(send).toHaveBeenCalledWith({
      events: [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          visit_id: "123e4567-e89b-42d3-a456-426614174001",
          occurred_at: "2026-08-11T18:00:00.000Z",
          name: "route_summary",
          properties: { route: "home", active_ms: 1_200, views: 1 },
        },
      ],
    });
  });

  it("drops work when disabled and restores a batch after transport failure", async () => {
    const disabledSend = vi.fn();
    const disabled = createAnalyticsClient({
      enabled: false,
      send: disabledSend,
    });
    disabled.track("app_installed", {});
    await disabled.flush();
    expect(disabledSend).not.toHaveBeenCalled();

    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const client = createAnalyticsClient({ enabled: true, send });
    client.track("app_installed", {});
    await expect(client.flush()).resolves.toBeUndefined();
    await client.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("bounds the in-memory queue", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = createAnalyticsClient({ enabled: true, send });
    for (let index = 0; index < 30; index++) {
      client.track("app_installed", {});
    }
    await client.flush();
    expect(send.mock.calls[0][0].events).toHaveLength(20);
  });
});
