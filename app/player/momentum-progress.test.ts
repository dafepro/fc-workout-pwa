import { describe, expect, it } from "vitest";
import { momentumProgress } from "./momentum-progress";

describe("Momentum score progress", () => {
  it.each([
    { score: 0, state: "ready", percentage: 0 },
    { score: 4, state: "started", percentage: 4 },
    { score: 25, state: "building", percentage: 25 },
    { score: 65, state: "on-a-roll", percentage: 65 },
    { score: 100, state: "on-a-roll", percentage: 100 },
  ])("projects $score as $state", ({ score, state, percentage }) => {
    expect(momentumProgress(score)).toEqual({ score, percentage, state });
  });

  it("clamps malformed or out-of-range scores", () => {
    expect(momentumProgress(-2)).toEqual({
      score: 0,
      percentage: 0,
      state: "ready",
    });
    expect(momentumProgress(120)).toEqual({
      score: 100,
      percentage: 100,
      state: "on-a-roll",
    });
  });
});
