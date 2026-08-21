import { describe, expect, it } from "vitest";
import type { ConnectedTeamCanvasProjection } from "../data/team-canvas-gateway";
import {
  applyTeamCanvasPhysicsFrame,
  applyTeamCanvasPieceFrame,
  parseTeamCanvasPieceFrame,
  parseTeamCanvasPhysicsFrame,
} from "./physics";

describe("team canvas physics projection", () => {
  it("strictly parses finite versioned frames", () => {
    const frame = parseTeamCanvasPhysicsFrame(
      JSON.stringify({
        v: 1,
        teamId: "team-one",
        weekKey: "2026-08-17",
        sceneId: "top-down-field",
        sequence: 12,
        bodies: [body("piece-one", 62, 44)],
        avatars: [{ playerId: "player-two", position: { x: 72, y: 28 } }],
      }),
    );

    expect(frame?.bodies[0].velocity).toEqual({ x: 3, y: -1 });
    expect(
      parseTeamCanvasPhysicsFrame(JSON.stringify({ ...frame, v: 2 })),
    ).toBeNull();
    expect(
      parseTeamCanvasPhysicsFrame(
        JSON.stringify({
          ...frame,
          bodies: [{ ...frame?.bodies[0], size: Number.NaN }],
        }),
      ),
    ).toBeNull();
  });

  it("patches streamed piece transforms by revision without changing permissions", () => {
    const projection = projectionFixture();
    projection.pieces[0].revision = 3;
    const frame = parseTeamCanvasPieceFrame(
      '{"id":"piece-one","x":64,"y":38,"size":50,"rotation":135,"revision":4}',
    )!;

    const applied = applyTeamCanvasPieceFrame(projection, frame, null);
    expect(applied.pieces[0]).toMatchObject({
      x: 64,
      y: 38,
      rotation: 135,
      editable: true,
      revision: 4,
    });
    expect(applyTeamCanvasPieceFrame(applied, frame, null)).toBe(applied);
    expect(applyTeamCanvasPieceFrame(projection, frame, "piece-one")).toBe(
      projection,
    );
  });

  it("applies newer same-scene frames while protecting the local drag", () => {
    const projection = projectionFixture();
    const frame = parseTeamCanvasPhysicsFrame(
      JSON.stringify({
        v: 1,
        teamId: "team-one",
        weekKey: "2026-08-17",
        sceneId: "top-down-field",
        sequence: 12,
        bodies: [body("piece-one", 62, 44)],
        avatars: [
          { playerId: "player-one", position: { x: 90, y: 90 } },
          { playerId: "player-two", position: { x: 72, y: 28 } },
        ],
      }),
    )!;

    const applied = applyTeamCanvasPhysicsFrame(
      projection,
      frame,
      "player-one",
      "piece-one",
      true,
    );

    expect(applied.physics.sequence).toBe(12);
    expect(applied.pieces[0]).toMatchObject({ x: 50, y: 50 });
    expect(applied.members[0].position).toEqual({ x: 42, y: 58 });
    expect(applied.members[1].position).toEqual({ x: 72, y: 28 });
    expect(
      applyTeamCanvasPhysicsFrame(applied, frame, "player-one", null),
    ).toBe(applied);
  });
});

function body(id: string, x: number, y: number) {
  return {
    id,
    assetId: "soccer",
    position: { x, y },
    velocity: { x: 3, y: -1 },
    size: 44,
    angle: 18,
    angularVelocity: 6,
    sleeping: false,
    recovering: false,
    resetCount: 0,
  };
}

function projectionFixture(): ConnectedTeamCanvasProjection {
  return {
    team: { id: "team-one", name: "Trailblazers", weeklyGoal: 3 },
    dayKey: "2026-08-21",
    weekKey: "2026-08-17",
    physics: { v: 1, sceneId: "top-down-field", sequence: 2 },
    settings: {
      backgroundAssetId: "soccer-field",
      backgroundColor: "#89C981",
      textColor: "#FFFFFF",
      textSize: 100,
      textStyle: "block",
      stampChoices: ["soccer"],
      developerStampLimit: 0,
      revision: 1,
    },
    stampChoices: [],
    members: [
      {
        player: player("player-one", "Ava"),
        avatarConfiguration: {},
        position: { x: 42, y: 58 },
        starDayKeys: [],
      },
      {
        player: player("player-two", "Mason"),
        avatarConfiguration: {},
        position: { x: 32, y: 38 },
        starDayKeys: [],
      },
    ],
    pieces: [
      {
        id: "piece-one",
        dayKey: "2026-08-21",
        asset: { id: "soccer", kind: "emoji", glyph: "⚽", label: "Ball" },
        status: "live",
        editable: true,
        x: 50,
        y: 50,
        size: 44,
        rotation: 0,
      },
    ],
    avatarPosition: { x: 42, y: 58 },
    availableRewards: 0,
    cooldownComplete: false,
    developerControlsEnabled: false,
  };
}

function player(id: string, firstName: string) {
  return {
    id,
    firstName,
    lastInitial: "T.",
    initials: `${firstName[0]}T`,
    avatarColor: "blue" as const,
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
}
