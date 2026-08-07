import { afterEach, describe, expect, it, vi } from "vitest";
import { createReactionGateway } from "./reaction-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected reaction gateway", () => {
  it("preserves the server's opaque recipient ID", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "reaction-1", remainingForRecipientToday: 4 }),
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
});
