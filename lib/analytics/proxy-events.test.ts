import { describe, expect, it } from "vitest";
import { proxyEvents } from "./proxy-events";

describe("proxyEvents", () => {
  it("counts only newly accepted training and rest, not successful replays", () => {
    const body = JSON.stringify({
      activityDefinitionId: "hill-sprints",
      plan: { planId: "private-plan" },
      completionOutcome: "partial",
    });
    expect(
      proxyEvents("POST", "v1/me/training-entries", body, 201, 20).map(
        (event) => event.name,
      ),
    ).toEqual([
      "training_entry_created",
      "planned_activity_recorded",
      "product_operation_completed",
    ]);
    expect(
      proxyEvents("POST", "v1/me/training-entries", body, 200, 20).map(
        (event) => event.name,
      ),
    ).toEqual(["product_operation_completed"]);
    expect(
      proxyEvents("POST", "v1/me/planned-rest-check-ins", body, 201, 20)[0],
    ).toEqual({ name: "planned_rest_check_in_created", properties: {} });
    expect(
      proxyEvents("POST", "v1/me/planned-rest-check-ins", body, 200, 20).map(
        (event) => event.name,
      ),
    ).toEqual(["product_operation_completed"]);
    expect(
      JSON.stringify(
        proxyEvents("POST", "v1/me/training-entries", body, 201, 20),
      ),
    ).not.toContain("private-plan");
  });
  it.each([
    ["v1/me/prize-boxes/claim-daily", "prize_daily_claim_completed"],
    ["v1/me/prize-boxes/private-box/open", "prize_box_opened"],
  ])("bounds new and existing outcomes for %s", (path, name) => {
    for (const [status, outcome] of [
      [201, "created"],
      [200, "existing"],
    ] as const) {
      expect(proxyEvents("POST", path, undefined, status, 20)[0]).toEqual({
        name,
        properties: { outcome },
      });
    }
    const failed = proxyEvents("POST", path, undefined, 503, 20);
    expect(failed).toEqual([
      expect.objectContaining({
        name: "product_operation_completed",
        properties: expect.objectContaining({ outcome: "failure" }),
      }),
    ]);
    expect(JSON.stringify(failed)).not.toContain("private-box");
  });
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
