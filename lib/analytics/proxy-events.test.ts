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

  it("normalizes reactions and failure reasons", () => {
    expect(
      proxyEvents(
        "POST",
        "v1/reactions",
        JSON.stringify({
          recipientPlayerId: "private-player",
          reactionType: "robot_leg",
          context: "leaderboard",
        }),
        201,
        20,
      )[0],
    ).toEqual({
      name: "reaction_created",
      properties: {
        context: "leaderboard",
        reaction: "robot-leg",
      },
    });
    expect(
      proxyEvents("POST", "v1/me/training-entries", "{}", 409, 20)[0],
    ).toEqual({
      name: "training_entry_rejected",
      properties: { reason: "conflict" },
    });
  });

  it("projects Today completion without plan identity or workout results", () => {
    const events = proxyEvents(
      "POST",
      "v1/me/training-entries",
      JSON.stringify({
        activityDefinitionId: "hill-sprints",
        plan: { planId: "private-plan", dayIndex: 2, blockIndex: 0 },
        result: { value: 12 },
        note: "private coach note",
      }),
      201,
      20,
    );
    expect(events).toContainEqual({
      name: "today_requirement_recorded",
      properties: {
        source: "coach_plan",
        kind: "training",
        outcome: "success",
      },
    });
    expect(JSON.stringify(events)).not.toMatch(/private|value|note/);
  });

  it("projects planned recovery, Prize Box, and Team Reward outcomes", () => {
    expect(
      proxyEvents(
        "POST",
        "v1/teams/team-one/canvas/rest",
        JSON.stringify({ planId: "private-plan", dayIndex: 1 }),
        201,
        20,
      ),
    ).toContainEqual({
      name: "today_requirement_recorded",
      properties: {
        source: "coach_plan",
        kind: "recovery",
        outcome: "success",
      },
    });
    expect(
      proxyEvents(
        "POST",
        "v1/me/prize-boxes/private-box/open",
        undefined,
        409,
        20,
      ),
    ).toEqual([
      {
        name: "prize_box_operation",
        properties: { action: "open", outcome: "conflict" },
      },
    ]);
    expect(
      proxyEvents(
        "POST",
        "v1/teams/team-one/rewards/reward-one/reports",
        JSON.stringify({ reason: "other" }),
        201,
        20,
      ),
    ).toEqual([
      { name: "team_reward_reported", properties: { outcome: "created" } },
    ]);
  });
});
