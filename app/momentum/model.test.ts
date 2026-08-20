import { describe, expect, it } from "vitest";
import {
  applyMomentumImpact,
  gaugeBand,
  momentumImpact,
  nextWorkload,
} from "./model";

describe("continuous Momentum prototype rules", () => {
  it("treats the prescribed goal as complete and keeps stretch optional", () => {
    expect(momentumImpact("prescribed-goal")).toEqual({
      personalEffect: "full",
      gaugeDelta: 12,
      teamContribution: 1,
      resultRequired: true,
      teamVisibility: "normalized-only",
    });
    expect(momentumImpact("prescribed-stretch")).toEqual({
      personalEffect: "small",
      gaugeDelta: 2,
      teamContribution: 0,
      resultRequired: true,
      teamVisibility: "none",
    });
  });

  it("gives a different approved workout less effect unless it is a safety substitution", () => {
    expect(momentumImpact("approved-alternative")).toMatchObject({
      personalEffect: "partial",
      gaugeDelta: 7,
      teamContribution: 0.5,
    });
    expect(momentumImpact("equivalent-substitution")).toMatchObject({
      personalEffect: "full",
      gaugeDelta: 12,
      teamContribution: 1,
    });
  });

  it("allows one supportive recovery effect while later extras remain history-only", () => {
    expect(momentumImpact("paired-recovery")).toMatchObject({
      personalEffect: "supportive",
      gaugeDelta: 3,
      teamContribution: 0,
    });
    expect(momentumImpact("extra-log")).toMatchObject({
      personalEffect: "none",
      gaugeDelta: 0,
      teamContribution: 0,
    });
  });

  it("records planned rest without a result and exposes it only as aggregate plan-following", () => {
    expect(momentumImpact("planned-rest")).toEqual({
      personalEffect: "hold",
      gaugeDelta: 0,
      teamContribution: 1,
      resultRequired: false,
      teamVisibility: "aggregate-only",
    });
  });

  it("never recommends another hard session after hard work or high tiredness", () => {
    expect(nextWorkload({ completed: "hard", exhaustion: 3 })).toBe("recovery");
    expect(nextWorkload({ completed: "assessment", exhaustion: 2 })).toBe(
      "recovery",
    );
    expect(nextWorkload({ completed: "moderate", exhaustion: 6 })).toBe(
      "recovery",
    );
  });

  it("keeps the internal gauge bounded without presenting a terminal 100 percent", () => {
    expect(applyMomentumImpact(88, "prescribed-goal")).toBe(92);
    expect(gaugeBand(18)).toBe("warming-up");
    expect(gaugeBand(44)).toBe("building");
    expect(gaugeBand(68)).toBe("rolling");
    expect(gaugeBand(92)).toBe("strong");
  });
});
