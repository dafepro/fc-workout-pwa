import type { ConnectedTeamCanvasProjection } from "../data/team-canvas-gateway";

export interface PhysicsVector {
  x: number;
  y: number;
}

export interface PhysicsBodyState {
  id: string;
  assetId: string;
  position: PhysicsVector;
  velocity: PhysicsVector;
  size: number;
  angle: number;
  angularVelocity: number;
  sleeping: boolean;
  recovering: boolean;
  resetCount: number;
}

export interface TeamCanvasPhysicsFrame {
  v: 1;
  teamId: string;
  weekKey: string;
  sceneId: "top-down-field" | "side-view" | "space";
  sequence: number;
  bodies: PhysicsBodyState[];
  avatars: { playerId: string; position: PhysicsVector }[];
  resets: string[];
}

export interface TeamCanvasPieceFrame {
  id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  revision: number;
}

export function parseTeamCanvasPieceFrame(
  encoded: string,
): TeamCanvasPieceFrame | null {
  if (encoded.length === 0 || encoded.length > 2048) return null;
  try {
    const value = JSON.parse(encoded) as Record<string, unknown>;
    if (
      !shortString(value.id) ||
      !finiteRange(value.x, 6, 94) ||
      !finiteRange(value.y, 6, 94) ||
      !finiteRange(value.size, 28, 76) ||
      !finiteRange(value.rotation, -180, 180) ||
      !Number.isInteger(value.revision) ||
      (value.revision as number) < 1
    ) {
      return null;
    }
    return value as unknown as TeamCanvasPieceFrame;
  } catch {
    return null;
  }
}

export function parseTeamCanvasPhysicsFrame(
  encoded: string,
): TeamCanvasPhysicsFrame | null {
  if (encoded.length === 0 || encoded.length > 64 * 1024) return null;
  try {
    const value = JSON.parse(encoded) as Record<string, unknown>;
    if (
      value.v !== 1 ||
      !shortString(value.teamId) ||
      !shortString(value.weekKey) ||
      !isScene(value.sceneId) ||
      !safeSequence(value.sequence) ||
      !Array.isArray(value.bodies) ||
      value.bodies.length > 64 ||
      !value.bodies.every(isBody) ||
      !Array.isArray(value.avatars) ||
      value.avatars.length > 128 ||
      !value.avatars.every(isAvatar) ||
      (value.resets !== undefined &&
        (!Array.isArray(value.resets) ||
          value.resets.length > 64 ||
          !value.resets.every(shortString)))
    ) {
      return null;
    }
    return {
      v: 1,
      teamId: value.teamId,
      weekKey: value.weekKey,
      sceneId: value.sceneId,
      sequence: value.sequence,
      bodies: value.bodies,
      avatars: value.avatars,
      resets: (value.resets as string[] | undefined) ?? [],
    };
  } catch {
    return null;
  }
}

export function applyTeamCanvasPhysicsFrame(
  projection: ConnectedTeamCanvasProjection,
  frame: TeamCanvasPhysicsFrame,
  currentPlayerID: string,
  selectedPieceID: string | null,
  protectCurrentAvatar = false,
): ConnectedTeamCanvasProjection {
  if (
    frame.teamId !== projection.team.id ||
    frame.weekKey !== projection.weekKey ||
    frame.sceneId !== projection.physics.sceneId ||
    frame.sequence <= projection.physics.sequence
  ) {
    return projection;
  }
  const bodies = new Map(frame.bodies.map((body) => [body.id, body]));
  const avatars = new Map(
    frame.avatars.map(({ playerId, position }) => [playerId, position]),
  );
  const ownAvatar = protectCurrentAvatar
    ? undefined
    : avatars.get(currentPlayerID);
  return {
    ...projection,
    physics: { ...projection.physics, sequence: frame.sequence },
    pieces: projection.pieces.map((piece) => {
      const body = bodies.get(piece.id);
      if (!body || body.assetId !== piece.asset.id) return piece;
      if (piece.id === selectedPieceID) return { ...piece, physics: body };
      return {
        ...piece,
        physics: body,
        x: body.position.x,
        y: body.position.y,
        size: body.size,
        rotation: body.angle,
      };
    }),
    members: projection.members.map((member) => {
      if (member.player.id === currentPlayerID && protectCurrentAvatar)
        return member;
      const position = avatars.get(member.player.id);
      return position ? { ...member, position } : member;
    }),
    avatarPosition: ownAvatar ?? projection.avatarPosition,
  };
}

export function applyTeamCanvasPieceFrame(
  projection: ConnectedTeamCanvasProjection,
  frame: TeamCanvasPieceFrame,
  selectedPieceID: string | null,
): ConnectedTeamCanvasProjection {
  const piece = projection.pieces.find(({ id }) => id === frame.id);
  if (
    !piece ||
    selectedPieceID === frame.id ||
    (piece.revision ?? 0) >= frame.revision
  ) {
    return projection;
  }
  return {
    ...projection,
    pieces: projection.pieces.map((candidate) =>
      candidate.id === frame.id
        ? {
            ...candidate,
            x: frame.x,
            y: frame.y,
            size: frame.size,
            rotation: frame.rotation,
            revision: frame.revision,
          }
        : candidate,
    ),
  };
}

function isBody(value: unknown): value is PhysicsBodyState {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    shortString(body.id) &&
    shortString(body.assetId) &&
    isVector(body.position, -20, 120) &&
    isVector(body.velocity, -200, 200) &&
    finiteRange(body.size, 28, 76) &&
    finiteRange(body.angle, -360, 360) &&
    finiteRange(body.angularVelocity, -720, 720) &&
    typeof body.sleeping === "boolean" &&
    typeof body.recovering === "boolean" &&
    Number.isInteger(body.resetCount) &&
    (body.resetCount as number) >= 0 &&
    (body.resetCount as number) <= 1_000_000
  );
}

function isAvatar(
  value: unknown,
): value is { playerId: string; position: PhysicsVector } {
  if (!value || typeof value !== "object") return false;
  const avatar = value as Record<string, unknown>;
  return shortString(avatar.playerId) && isVector(avatar.position, 6, 94);
}

function isVector(value: unknown, minimum: number, maximum: number) {
  if (!value || typeof value !== "object") return false;
  const vector = value as Record<string, unknown>;
  return (
    finiteRange(vector.x, minimum, maximum) &&
    finiteRange(vector.y, minimum, maximum)
  );
}

function finiteRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function safeSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function shortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isScene(value: unknown): value is TeamCanvasPhysicsFrame["sceneId"] {
  return (
    value === "top-down-field" || value === "side-view" || value === "space"
  );
}
