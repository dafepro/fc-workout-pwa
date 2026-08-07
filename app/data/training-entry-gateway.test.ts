import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrainingEntryGateway } from "./training-entry-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected training-entry gateway", () => {
  it("preserves the server's opaque owner ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            {
              id: "entry-1",
              playerId: "player_opaque_123",
              teamId: "team_opaque_456",
              activityDefinitionId: "hill-sprints",
              assignmentId: null,
              occurredAt: "2026-08-06T12:00:00Z",
              result: { kind: "repetitions", value: 8, unit: "reps" },
              effortLevel: 4,
              exhaustionLevel: 3,
              createdAt: "2026-08-06T12:01:00Z",
              deleteEligibleUntil: "2026-08-07T12:01:00Z",
            },
          ],
        }),
      ),
    );

    const entries = await createTrainingEntryGateway(
      true,
      "team_opaque_456",
    ).list();

    expect(entries[0].playerId).toBe("player_opaque_123");
  });
});
