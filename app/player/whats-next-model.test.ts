import { describe, expect, it } from "vitest";
import { decideWhatsNext } from "./whats-next-model";

const completedTraining = {
  restDay: false,
  planComplete: true,
  cooldownComplete: false,
  teamAvailable: true,
  effort: 4,
  tiredness: 3,
};

describe("decideWhatsNext", () => {
  it("recommends a reviewed cooldown after an ordinary training day", () => {
    expect(decideWhatsNext(completedTraining)).toEqual({
      recommendation: "cooldown",
      secondary: ["lounge", "additional-activity"],
      showCooldownStatus: false,
      showTeamLocked: false,
    });
  });

  it.each([
    { effort: 6, tiredness: 3 },
    { effort: 4, tiredness: 6 },
  ])(
    "does not suggest more exercise after a high-strain check-in",
    (levels) => {
      expect(decideWhatsNext({ ...completedTraining, ...levels })).toEqual({
        recommendation: "recovery",
        secondary: ["lounge"],
        showCooldownStatus: false,
        showTeamLocked: false,
      });
    },
  );

  it("makes the lounge primary once cooldown is complete", () => {
    expect(
      decideWhatsNext({ ...completedTraining, cooldownComplete: true }),
    ).toEqual({
      recommendation: "lounge",
      secondary: ["additional-activity"],
      showCooldownStatus: true,
      showTeamLocked: false,
    });
  });

  it("never suggests additional training after planned rest", () => {
    expect(decideWhatsNext({ ...completedTraining, restDay: true })).toEqual({
      recommendation: "lounge",
      secondary: [],
      showCooldownStatus: false,
      showTeamLocked: false,
    });
  });

  it("uses an all-set state and exposes the real Team lock", () => {
    expect(
      decideWhatsNext({
        ...completedTraining,
        cooldownComplete: true,
        teamAvailable: false,
      }),
    ).toEqual({
      recommendation: "all-set",
      secondary: ["additional-activity"],
      showCooldownStatus: true,
      showTeamLocked: true,
    });
  });
});
