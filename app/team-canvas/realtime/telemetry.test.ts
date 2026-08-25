import { describe, expect, it } from "vitest";
import type { TeamCanvasPhysicsFrame } from "../physics";
import {
  boundedTeamCanvasTelemetry,
  EMPTY_TEAM_CANVAS_TELEMETRY,
  frameCorrectionDistance,
} from "./telemetry";

describe("Team Canvas telemetry", () => {
  it("measures correction distance without identity fields", () => {
    const current = frame({ x: 10, y: 10 });
    const canonical = frame({ x: 13, y: 14 });

    expect(frameCorrectionDistance(current, canonical)).toBe(5);
    expect(
      boundedTeamCanvasTelemetry(EMPTY_TEAM_CANVAS_TELEMETRY, {
        reconnects: Number.POSITIVE_INFINITY,
        inputToRenderMs: -4,
      }),
    ).toMatchObject({ reconnects: 0, inputToRenderMs: 0 });
  });
});

function frame(position: { x: number; y: number }): TeamCanvasPhysicsFrame {
  return {
    v: 1,
    teamId: "team-one",
    weekKey: "2026-08-24",
    sceneId: "top-down-field",
    sequence: 1,
    bodies: [
      {
        id: "ball",
        assetId: "soccer",
        position,
        velocity: { x: 0, y: 0 },
        size: 44,
        angle: 0,
        angularVelocity: 0,
        sleeping: false,
        recovering: false,
        resetCount: 0,
      },
    ],
    avatars: [],
    resets: [],
  };
}
