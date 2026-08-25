import type { TeamCanvasTelemetry } from "../../player/team-canvas/widget-contract";
import type { TeamCanvasPhysicsFrame } from "../physics";

export const EMPTY_TEAM_CANVAS_TELEMETRY: TeamCanvasTelemetry = {
  reconnects: 0,
  inputToRenderMs: null,
  correctionDistance: 0,
  hostEpoch: 0,
  droppedFrames: 0,
  checkpointAgeMs: null,
};

export function boundedTeamCanvasTelemetry(
  current: TeamCanvasTelemetry,
  patch: Partial<TeamCanvasTelemetry>,
): TeamCanvasTelemetry {
  return {
    reconnects: boundedInteger(patch.reconnects ?? current.reconnects, 1000),
    inputToRenderMs: boundedOptional(
      patch.inputToRenderMs ?? current.inputToRenderMs,
      60_000,
    ),
    correctionDistance: boundedNumber(
      patch.correctionDistance ?? current.correctionDistance,
      200,
    ),
    hostEpoch: boundedInteger(patch.hostEpoch ?? current.hostEpoch, 1_000_000),
    droppedFrames: boundedInteger(
      patch.droppedFrames ?? current.droppedFrames,
      1_000_000,
    ),
    checkpointAgeMs: boundedOptional(
      patch.checkpointAgeMs ?? current.checkpointAgeMs,
      7 * 24 * 60 * 60 * 1000,
    ),
  };
}

export function frameCorrectionDistance(
  current: TeamCanvasPhysicsFrame,
  canonical: TeamCanvasPhysicsFrame,
): number {
  const currentBodies = new Map(
    current.bodies.map((body) => [body.id, body.position]),
  );
  const currentAvatars = new Map(
    current.avatars.map((avatar) => [avatar.playerId, avatar.position]),
  );
  let greatest = 0;
  for (const body of canonical.bodies) {
    greatest = Math.max(
      greatest,
      distance(currentBodies.get(body.id), body.position),
    );
  }
  for (const avatar of canonical.avatars) {
    greatest = Math.max(
      greatest,
      distance(currentAvatars.get(avatar.playerId), avatar.position),
    );
  }
  return boundedNumber(greatest, 200);
}

export function teamCanvasHealthProperties(
  connection: "connecting" | "connected" | "reconnecting" | "unavailable",
  telemetry: TeamCanvasTelemetry,
) {
  return {
    connection,
    reconnects: telemetry.reconnects,
    input_latency:
      telemetry.inputToRenderMs === null
        ? ("unknown" as const)
        : telemetry.inputToRenderMs < 50
          ? ("under_50ms" as const)
          : telemetry.inputToRenderMs < 150
            ? ("under_150ms" as const)
            : telemetry.inputToRenderMs < 500
              ? ("under_500ms" as const)
              : ("over_500ms" as const),
    correction:
      telemetry.correctionDistance === 0
        ? ("none" as const)
        : telemetry.correctionDistance < 1
          ? ("under_1" as const)
          : telemetry.correctionDistance < 5
            ? ("under_5" as const)
            : ("over_5" as const),
    host_epoch: telemetry.hostEpoch,
    dropped_frames: telemetry.droppedFrames,
    checkpoint_age:
      telemetry.checkpointAgeMs === null
        ? ("unknown" as const)
        : telemetry.checkpointAgeMs < 30_000
          ? ("under_30s" as const)
          : telemetry.checkpointAgeMs < 120_000
            ? ("under_2m" as const)
            : ("over_2m" as const),
  };
}

function distance(
  first: { x: number; y: number } | undefined,
  second: { x: number; y: number },
) {
  return first ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

function boundedOptional(value: number | null, maximum: number) {
  return value === null ? null : boundedNumber(value, maximum);
}

function boundedInteger(value: number, maximum: number) {
  return Math.round(boundedNumber(value, maximum));
}

function boundedNumber(value: number, maximum: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
}
