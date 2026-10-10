import { describe, expect, it } from "vitest";
import { participationAction } from "./participation-action";

describe("the next participation action", () => {
  it("does not ask for a plan that does not exist", () => {
    expect(participationAction(null)).toMatchObject({
      href: "/log",
      label: "Record a workout",
    });
    expect(participationAction(null).detail).not.toContain("plan");
  });
  it("routes rest to its check-in and unfinished blocks to their exact provenance", () => {
    const day = {
      kind: "rest" as const,
      completed: false,
      blocks: [],
      planId: "plan-one",
      dayIndex: 2,
    };
    expect(participationAction(day)).toMatchObject({
      href: "/",
      label: "Check in for planned rest",
    });
    const action = participationAction({
      ...day,
      kind: "workout",
      blocks: [
        {
          blockIndex: 0,
          completed: true,
          activityDefinitionId: "hill-sprints",
        },
        {
          blockIndex: 1,
          completed: false,
          activityDefinitionId: "timed-run-walk",
        },
      ],
    });
    expect(action.href).toBe(
      "/log?planId=plan-one&dayIndex=2&blockIndex=1&activityId=timed-run-walk",
    );
  });
});
