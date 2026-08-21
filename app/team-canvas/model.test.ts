import { describe, expect, it } from "vitest";
import {
  availableRewardCount,
  addLivePiece,
  beginDay,
  dailyStampSet,
  initialTeamCanvasState,
  logExtraActivity,
  moveOwnAvatar,
  recordCooldown,
  recordPlannedRest,
  recordPrimary,
  teamCanvasProjection,
  teamCanvasUnlocked,
  updateOwnedPiece,
  weeklyTextStyle,
  type BoardPiece,
  type StampAsset,
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
    expect(nextWeek.boardPieces).toEqual([]);
  });

  it("provides the same deterministic five stamp choices to the team each day", () => {
    const first = dailyStampSet("team-hill-striders", "2026-08-20");

    expect(first).toHaveLength(5);
    expect(new Set(first.map(({ id }) => id)).size).toBe(5);
    expect(first.every(({ kind }) => kind === "emoji")).toBe(true);
    expect(dailyStampSet("team-hill-striders", "2026-08-20")).toEqual(first);
    expect(dailyStampSet("team-hill-striders", "2026-08-21")).not.toEqual(
      first,
    );
    expect(weeklyTextStyle("team-hill-striders", "2026-08-17")).toBe(
      weeklyTextStyle("team-hill-striders", "2026-08-17"),
    );
  });

  it("publishes a reward as a live owned piece and consumes the reward once", () => {
    const reached = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const asset = dailyStampSet(reached.teamId, reached.dayKey)[0];
    const live = addLivePiece(reached, asset);

    expect(live.boardPieces).toHaveLength(1);
    expect(live.boardPieces[0]).toMatchObject({
      asset,
      ownerId: "mason",
      status: "live",
      dayKey: "2026-08-20",
    });
    expect(live.selectedPieceId).toBe(live.boardPieces[0].id);
    expect(availableRewardCount(live)).toBe(0);
    expect(addLivePiece(live, asset)).toBe(live);
  });

  it("clamps owned live edits and settles the piece at the next day boundary", () => {
    const reached = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const asset = dailyStampSet(reached.teamId, reached.dayKey)[0];
    const live = addLivePiece(reached, asset);
    const pieceId = live.boardPieces[0].id;
    const edited = updateOwnedPiece(live, pieceId, {
      x: 120,
      y: -20,
      size: 100,
      rotation: 90,
    });

    expect(edited.boardPieces[0]).toMatchObject({
      x: 94,
      y: 6,
      size: 64,
      rotation: 45,
      status: "live",
    });

    const tomorrow = beginDay(edited, {
      dayKey: "2026-08-21",
      dayKind: "training",
    });
    expect(tomorrow.boardPieces[0]).toMatchObject({ status: "pasted" });
    expect(tomorrow.selectedPieceId).toBeNull();
    expect(updateOwnedPiece(tomorrow, pieceId, { rotation: 0 })).toBe(tomorrow);
  });

  it("projects generic emoji, image, and sprite assets without owner identity", () => {
    const assets: StampAsset[] = [
      { id: "emoji-test", kind: "emoji", glyph: "⚡", label: "Bolt" },
      {
        id: "image-test",
        kind: "image",
        src: "/favicon.svg",
        alt: "ZoomiGo mark",
      },
      {
        id: "sprite-test",
        kind: "sprite",
        src: "/stamps/runner.webp",
        alt: "Running player",
        frames: 8,
        frameWidth: 64,
        frameHeight: 64,
      },
    ];
    const pieces: BoardPiece[] = assets.map((asset, index) => ({
      id: `piece-${index}`,
      asset,
      ownerId: index === 0 ? "mason" : "player-ari",
      dayKey: "2026-08-20",
      status: index === 2 ? "pasted" : "live",
      x: 20 + index * 20,
      y: 40,
      size: 40,
      rotation: 0,
    }));
    const complete = recordPrimary(
      { ...initialTeamCanvasState(), boardPieces: pieces },
      { completion: "goal", effort: 4, tiredness: 3 },
    );
    const projection = teamCanvasProjection(complete)!;

    expect(projection.pieces.map(({ asset }) => asset.kind)).toEqual([
      "emoji",
      "image",
      "sprite",
    ]);
    expect(projection.pieces.map(({ editable }) => editable)).toEqual([
      true,
      false,
      false,
    ]);
    expect(JSON.stringify(projection)).not.toContain("ownerId");
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
    expect(projection).toMatchObject({ starDayKeys: ["2026-08-20"] });
    expect(JSON.stringify(projection)).not.toMatch(
      /effort|tiredness|history|completion/i,
    );
  });
});
