import { describe, expect, it } from "vitest";
import { momentumProgress } from "./momentum-progress";

describe("Momentum progress", () => {
  it.each([
    { score: 0, state: "ready" },
    { score: 0.1, state: "started" },
    { score: 24.9, state: "started" },
    { score: 25, state: "building" },
    { score: 64.9, state: "building" },
    { score: 65, state: "on-a-roll" },
    { score: 100, state: "on-a-roll" },
  ] as const)("projects $score as $state", ({ score, state }) => {
    expect(momentumProgress(score)).toEqual({
      score,
      percentage: score,
      state,
    });
  });

  it("clamps and rounds the server projection defensively", () => {
    expect(momentumProgress(-2).score).toBe(0);
    expect(momentumProgress(120).score).toBe(100);
    expect(momentumProgress(42.54).score).toBe(42.5);
    expect(momentumProgress(Number.NaN).score).toBe(0);
  });
});
