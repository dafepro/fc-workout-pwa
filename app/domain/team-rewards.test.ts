import { describe, expect, it } from "vitest";

import {
  evaluateTeamReward,
  validateTeamRewardRule,
  type TeamRewardRule,
} from "./team-rewards";

const teamDaysRule: TeamRewardRule = {
  version: 1,
  kind: "qualifying_team_days",
  requiredDays: 3,
  minimumRosterPercent: 80,
  participationScope: "recommended_workout",
};

describe("team reward rules", () => {
  it("counts a team day only when the rounded-up roster threshold participates", () => {
    const progress = evaluateTeamReward(teamDaysRule, {
      days: [
        { date: "2026-08-20", activePlayers: 10, qualifyingPlayers: 8 },
        { date: "2026-08-21", activePlayers: 10, qualifyingPlayers: 7 },
        { date: "2026-08-22", activePlayers: 5, qualifyingPlayers: 4 },
      ],
      players: [],
    });

    expect(progress.current).toBe(2);
    expect(progress.target).toBe(3);
    expect(progress.percent).toBe(67);
    expect(progress.contributionPercent).toBe(96);
    expect(progress.achieved).toBe(false);
    expect(progress.days.map((day) => day.qualifies)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("does not let an empty roster create a qualifying day", () => {
    const progress = evaluateTeamReward(teamDaysRule, {
      days: [{ date: "2026-08-20", activePlayers: 0, qualifyingPlayers: 0 }],
      players: [],
    });

    expect(progress.current).toBe(0);
  });

  it("supports the teammate consistency template without exposing performance", () => {
    const rule: TeamRewardRule = {
      version: 1,
      kind: "teammate_consistency",
      requiredPlayers: 3,
      requiredDaysPerPlayer: 2,
      participationScope: "any_approved_workout",
    };
    const progress = evaluateTeamReward(rule, {
      days: [],
      players: [
        { playerId: "p1", qualifyingDays: 3 },
        { playerId: "p2", qualifyingDays: 2 },
        { playerId: "p3", qualifyingDays: 1 },
        { playerId: "p4", qualifyingDays: 4 },
      ],
    });

    expect(progress.current).toBe(3);
    expect(progress.target).toBe(3);
    expect(progress.percent).toBe(100);
    expect(progress.achieved).toBe(true);
  });

  it("shows capped partial consistency progress before a teammate finishes every day", () => {
    const progress = evaluateTeamReward(
      {
        version: 1,
        kind: "teammate_consistency",
        requiredPlayers: 2,
        requiredDaysPerPlayer: 10,
        participationScope: "any_approved_workout",
      },
      {
        days: [],
        players: [
          { playerId: "p1", qualifyingDays: 9 },
          { playerId: "p2", qualifyingDays: 4 },
          { playerId: "p3", qualifyingDays: 1 },
        ],
      },
    );

    expect(progress.current).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.contributionPercent).toBe(65);
    expect(progress.started).toBe(2);
    expect(progress.units).toEqual([
      { current: 9, target: 10, complete: false },
      { current: 4, target: 10, complete: false },
    ]);
    expect(progress.achieved).toBe(false);
  });

  it("rejects unsafe or unbounded rule values", () => {
    expect(
      validateTeamRewardRule({
        ...teamDaysRule,
        minimumRosterPercent: 101,
      }),
    ).toContain("minimumRosterPercent");
    expect(
      validateTeamRewardRule({ ...teamDaysRule, requiredDays: 0 }),
    ).toContain("requiredDays");
  });

  it("rejects an unsupported participation scope at the API boundary", () => {
    expect(
      validateTeamRewardRule({
        ...teamDaysRule,
        participationScope: "raw_performance" as "recommended_workout",
      }),
    ).toContain("participationScope");
  });
});
