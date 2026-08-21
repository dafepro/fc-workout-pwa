import { describe, expect, it } from "vitest";
import {
  completePlan,
  initialMomentumState,
  logExtraActivity,
  logRecovery,
  momentumBand,
  nextSuggestedWorkload,
  recordPlannedRest,
  teamMomentumProjection,
} from "./model";

describe("Momentum Alpha rules", () => {
  it("records one primary plan effect and one normalized Team lift", () => {
    const completed = completePlan(initialMomentumState(), {
      choice: "goal",
      feeling: "good",
    });
    const duplicate = completePlan(completed, {
      choice: "stretch",
      feeling: "good",
    });

    expect(completed.personalMomentum).toBeGreaterThan(
      initialMomentumState().personalMomentum,
    );
    expect(completed.teamContribution).toBe(1);
    expect(duplicate).toEqual(completed);
    expect(completed.history).toHaveLength(1);
  });

  it("keeps stretch optional and private", () => {
    const goal = completePlan(initialMomentumState(), {
      choice: "goal",
      feeling: "good",
    });
    const stretch = completePlan(initialMomentumState(), {
      choice: "stretch",
      feeling: "good",
    });

    expect(stretch.personalMomentum).toBeGreaterThan(goal.personalMomentum);
    expect(stretch.teamContribution).toBe(goal.teamContribution);
  });

  it("promotes recovery after demanding work or a very tired check-in", () => {
    expect(nextSuggestedWorkload("hard", "good")).toBe("recovery");
    expect(nextSuggestedWorkload("assessment", "tired")).toBe("recovery");
    expect(nextSuggestedWorkload("moderate", "very-tired")).toBe("recovery");
  });

  it("allows one supportive recovery while extras stay history-only", () => {
    const completed = completePlan(initialMomentumState(), {
      choice: "goal",
      feeling: "good",
    });
    const recovered = logRecovery(completed);
    const duplicateRecovery = logRecovery(recovered);
    const withExtra = logExtraActivity(recovered, "ball-control");

    expect(recovered.personalMomentum).toBeGreaterThan(
      completed.personalMomentum,
    );
    expect(recovered.teamContribution).toBe(completed.teamContribution);
    expect(duplicateRecovery).toEqual(recovered);
    expect(withExtra.personalMomentum).toBe(recovered.personalMomentum);
    expect(withExtra.teamContribution).toBe(recovered.teamContribution);
    expect(withExtra.history.at(-1)?.momentumEffect).toBe("history-only");
  });

  it("records planned rest without inventing a result", () => {
    const rested = recordPlannedRest(initialMomentumState());

    expect(rested.personalMomentum).toBe(
      initialMomentumState().personalMomentum,
    );
    expect(rested.teamContribution).toBe(1);
    expect(rested.history[0]).not.toHaveProperty("result");
  });

  it("keeps team projection aggregate and free of private performance", () => {
    const privateState = completePlan(initialMomentumState(), {
      choice: "stretch",
      feeling: "very-tired",
    });
    const projection = teamMomentumProjection(privateState);

    expect(projection).toEqual({
      band: "building",
      recentPlanFollowers: 9,
      highlightedPlayers: ["Ari", "Elena", "Noah", "Zoe"],
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /10 reps|very-tired|stretch|result/i,
    );
  });

  it("uses calm named bands and never exposes a perfect endpoint", () => {
    expect(momentumBand(18)).toBe("warming-up");
    expect(momentumBand(44)).toBe("building");
    expect(momentumBand(68)).toBe("rolling");
    expect(momentumBand(92)).toBe("strong");
    expect(momentumBand(100)).toBe("strong");
  });
});
