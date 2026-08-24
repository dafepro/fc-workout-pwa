import { describe, expect, it } from "vitest";
import { momentumProgress } from "./momentum-progress";

describe("Momentum weekly progress", () => {
  it.each([
    { sessions: 0, goal: 3, state: "ready", percentage: 0, remaining: 3 },
    { sessions: 1, goal: 3, state: "started", percentage: 33, remaining: 2 },
    { sessions: 2, goal: 3, state: "building", percentage: 67, remaining: 1 },
    {
      sessions: 3,
      goal: 3,
      state: "on-a-roll",
      percentage: 100,
      remaining: 0,
    },
  ])(
    "projects $sessions of $goal as $state",
    ({ sessions, goal, state, percentage, remaining }) => {
      expect(momentumProgress(sessions, goal)).toEqual({
        weeklySessions: sessions,
        weeklyGoal: goal,
        gaugeValue: sessions,
        percentage,
        remaining,
        state,
      });
    },
  );

  it("shows above-goal work truthfully while capping the gauge", () => {
    expect(momentumProgress(5, 3)).toEqual({
      weeklySessions: 5,
      weeklyGoal: 3,
      gaugeValue: 3,
      percentage: 100,
      remaining: 0,
      state: "on-a-roll",
    });
  });

  it("reaches the goal instead of forcing every intermediate state", () => {
    expect(momentumProgress(1, 1).state).toBe("on-a-roll");
  });

  it("normalizes malformed counts without creating negative progress", () => {
    expect(momentumProgress(-2, 0)).toEqual({
      weeklySessions: 0,
      weeklyGoal: 1,
      gaugeValue: 0,
      percentage: 0,
      remaining: 1,
      state: "ready",
    });
  });
});
