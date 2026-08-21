import { describe, expect, it } from "vitest";
import {
  availableRewardCount,
  beginDay,
  confirmEmoji,
  dailyEmojiSet,
  initialTeamCanvasState,
  logExtraActivity,
  moveOwnAvatar,
  recordCooldown,
  recordPlannedRest,
  recordPrimary,
  selectEmoji,
  teamCanvasProjection,
  teamCanvasUnlocked,
  updateEmojiDraft,
  weeklyTextStyle,
} from "./model";
import { entryRouteFor } from "./routes";

describe("Team Canvas rules", () => {
  it("reveals no team projection before today's appropriate plan is recorded", () => {
    const state = initialTeamCanvasState();

    expect(teamCanvasUnlocked(state)).toBe(false);
    expect(teamCanvasProjection(state)).toBeNull();
    expect(entryRouteFor(state)).toBe("/team-canvas");
  });

  it("unlocks Team and adds one weekly star for a completed goal", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });

    expect(teamCanvasUnlocked(complete)).toBe(true);
    expect(complete.completedDayKeys).toEqual(["2026-08-20"]);
    expect(availableRewardCount(complete)).toBe(0);
    expect(entryRouteFor(complete)).toBe("/team-canvas/team");
  });

  it("awards Reach and cooldown once each, never more than two in a day", () => {
    const reached = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const duplicateReach = recordPrimary(reached, {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const cooledDown = recordCooldown(duplicateReach);
    const duplicateCooldown = recordCooldown(cooledDown);

    expect(reached.completedDayKeys).toHaveLength(1);
    expect(availableRewardCount(reached)).toBe(1);
    expect(availableRewardCount(duplicateReach)).toBe(1);
    expect(availableRewardCount(cooledDown)).toBe(2);
    expect(availableRewardCount(duplicateCooldown)).toBe(2);
  });

  it("requires primary work before cooldown can earn a reward", () => {
    expect(recordCooldown(initialTeamCanvasState())).toEqual(
      initialTeamCanvasState(),
    );
  });

  it("lets planned rest and an approved alternative unlock Team without stamps", () => {
    const rest = recordPlannedRest(
      beginDay(initialTeamCanvasState(), {
        dayKey: "2026-08-21",
        dayKind: "rest",
      }),
    );
    const alternative = recordPrimary(initialTeamCanvasState(), {
      completion: "approved-alternative",
      effort: 3,
      tiredness: 3,
    });

    expect(teamCanvasUnlocked(rest)).toBe(true);
    expect(rest.completedDayKeys).toEqual(["2026-08-21"]);
    expect(availableRewardCount(rest)).toBe(0);
    expect(recordCooldown(rest)).toBe(rest);
    expect(teamCanvasUnlocked(alternative)).toBe(true);
    expect(availableRewardCount(alternative)).toBe(0);
  });

  it("keeps extra workouts private and outside stars, unlocks, and rewards", () => {
    const extra = logExtraActivity(initialTeamCanvasState(), "easy-walk");

    expect(extra.history).toHaveLength(1);
    expect(extra.primaryComplete).toBe(false);
    expect(extra.completedDayKeys).toEqual([]);
    expect(availableRewardCount(extra)).toBe(0);
  });

  it("counts each distinct plan-following day once and resets the canvas weekly", () => {
    const thursday = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    const friday = recordPlannedRest(
      beginDay(thursday, { dayKey: "2026-08-21", dayKind: "rest" }),
    );
    const nextWeek = beginDay(friday, {
      dayKey: "2026-08-24",
      dayKind: "training",
    });

    expect(friday.completedDayKeys).toEqual(["2026-08-20", "2026-08-21"]);
    expect(nextWeek.weekKey).toBe("2026-08-24");
    expect(nextWeek.completedDayKeys).toEqual([]);
    expect(nextWeek.emojiPlacements).toEqual([]);
  });

  it("provides the same deterministic five emoji choices to the team each day", () => {
    const first = dailyEmojiSet("team-hill-striders", "2026-08-20");

    expect(first).toHaveLength(5);
    expect(new Set(first).size).toBe(5);
    expect(dailyEmojiSet("team-hill-striders", "2026-08-20")).toEqual(first);
    expect(dailyEmojiSet("team-hill-striders", "2026-08-21")).not.toEqual(
      first,
    );
    expect(weeklyTextStyle("team-hill-striders", "2026-08-17")).toBe(
      weeklyTextStyle("team-hill-striders", "2026-08-17"),
    );
  });

  it("clamps a draft stamp, then locks it permanently when confirmed", () => {
    const reached = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const emoji = dailyEmojiSet(reached.teamId, reached.dayKey)[0];
    const selected = selectEmoji(reached, emoji);
    const edited = updateEmojiDraft(selected, {
      x: 120,
      y: -20,
      size: 100,
      rotation: 90,
    });
    const pasted = confirmEmoji(edited);

    expect(edited.emojiDraft).toMatchObject({
      x: 94,
      y: 6,
      size: 64,
      rotation: 45,
    });
    expect(pasted.emojiDraft).toBeNull();
    expect(pasted.emojiPlacements).toHaveLength(1);
    expect(pasted.emojiPlacements[0]).toMatchObject({ locked: true, emoji });
    expect(availableRewardCount(pasted)).toBe(0);
    expect(updateEmojiDraft(pasted, { rotation: 0 })).toBe(pasted);
  });

  it("always lets a player move their own avatar within the board", () => {
    const moved = moveOwnAvatar(initialTeamCanvasState(), { x: -10, y: 110 });
    expect(moved.avatarPosition).toEqual({ x: 6, y: 94 });
  });

  it("projects only team-safe fields after unlock", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 7,
      tiredness: 6,
    });
    const projection = teamCanvasProjection(complete);

    expect(projection).not.toBeNull();
    expect(projection).toMatchObject({ starCount: 1 });
    expect(JSON.stringify(projection)).not.toMatch(
      /effort|tiredness|history|completion/i,
    );
  });
});
