import { afterEach, describe, expect, it, vi } from "vitest";
import { createReactionGateway } from "./reaction-gateway";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connected reaction gateway", () => {
  it("preserves the server's opaque recipient ID", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "reaction-1", remainingForRecipientWindow: 4 }),
      );
    vi.stubGlobal("fetch", fetch);

    await createReactionGateway(true).send({
      recipientPlayerId: "player_opaque_123",
      reactionType: "clap",
      context: {
        type: "team_progress",
        teamId: "team_opaque_456",
        period: "weekly",
      },
    });

    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string).recipientPlayerId).toBe(
      "player_opaque_123",
    );
  });

  it("carries the opaque cursor between twenty-item inbox pages", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        items: [],
        nextCursor: "opaque-next-page",
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const page = await createReactionGateway(true).listReceived(
      "opaque-current-page",
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/zoomigo/v1/me/reaction-badges?limit=20&cursor=opaque-current-page",
    );
    expect(page).toEqual({ items: [], nextCursor: "opaque-next-page" });
  });
});

describe("local reaction gateway", () => {
  it("limits each recipient to five cheers in a rolling 30-minute window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T18:00:00.000Z"));
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const gateway = createReactionGateway(false);
    const input = {
      recipientPlayerId: "player-liam",
      reactionType: "clap" as const,
      context: {
        type: "team_progress" as const,
        teamId: "team-hill-striders",
        period: "weekly" as const,
      },
    };

    for (let index = 0; index < 5; index += 1) {
      const result = await gateway.send(input);
      expect(result.remainingForRecipientWindow).toBe(4 - index);
    }
    await expect(gateway.send(input)).rejects.toMatchObject({
      code: "reaction_rate_limit_reached",
    });
    await expect(
      gateway.send({ ...input, recipientPlayerId: "player-noah" }),
    ).resolves.toMatchObject({ remainingForRecipientWindow: 4 });

    vi.advanceTimersByTime(30 * 60 * 1000);
    await expect(gateway.send(input)).resolves.toMatchObject({
      remainingForRecipientWindow: 4,
    });
  });
});
