import { describe, expect, it } from "vitest";
import { proxyEvents } from "./proxy-events";

describe("proxyEvents", () => {
  it("projects a training write without performance or identity fields", () => {
    const events = proxyEvents(
      "POST",
      "v1/me/training-entries",
      JSON.stringify({
        teamId: "private-team",
        activityDefinitionId: "hill-sprints",
        assignmentId: "private-assignment",
        occurredAt: "2026-08-10T18:00:00.000Z",
        result: { value: 9000 },
        effortLevel: 5,
        exhaustionLevel: 4,
      }),
      201,
      300,
      new Date("2026-08-11T18:00:00.000Z"),
    );

    expect(events[0]).toEqual({
      name: "training_entry_created",
      properties: {
        activity: "hill-sprints",
        assignment_linked: true,
        backdate_days: 1,
      },
    });
    expect(JSON.stringify(events)).not.toMatch(
      /private|9000|effort|exhaustion|result/,
    );
  });

  it("normalizes supported reactions and drops the retired context", () => {
    expect(
      proxyEvents(
        "POST",
        "v1/reactions",
        JSON.stringify({
          recipientPlayerId: "private-player",
          reactionType: "robot_leg",
          context: "team_progress",
        }),
        201,
        20,
      )[0],
    ).toEqual({
      name: "reaction_created",
      properties: {
        context: "team_progress",
        reaction: "robot-leg",
      },
    });
    expect(
      proxyEvents(
        "POST",
        "v1/reactions",
        JSON.stringify({
          recipientPlayerId: "private-player",
          reactionType: "fire",
          context: "leaderboard",
        }),
        201,
        20,
      ),
    ).toEqual([
      {
        name: "product_operation_completed",
        properties: {
          operation: "reaction",
          outcome: "success",
          latency: "under_250ms",
        },
      },
    ]);
    expect(
      proxyEvents("POST", "v1/me/training-entries", "{}", 409, 20)[0],
    ).toEqual({
      name: "training_entry_rejected",
      properties: { reason: "conflict" },
    });
  });
});
