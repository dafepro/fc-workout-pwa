import type { AvatarConfiguration } from "../../avatar/types";
import type {
  ConnectedTeamCanvasProjection,
  TeamCanvasSettings,
} from "../../data/team-canvas-gateway";
import type {
  BoardPosition,
  BoardTransform,
  StampAsset,
  TeamCanvasState,
} from "../../team-canvas/model";

export const TEAM_CANVAS_WIDGET_CONTRACT_VERSION = 1 as const;

export type TeamCanvasAccessState =
  | "local"
  | "loading"
  | "locked"
  | "ready"
  | "error";

export type TeamCanvasConnectionState =
  | "local"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable";

export interface TeamCanvasTelemetry {
  reconnects: number;
  inputToRenderMs: number | null;
  correctionDistance: number;
  hostEpoch: number;
  droppedFrames: number;
  checkpointAgeMs: number | null;
}

export interface TeamCanvasStampUnlockPort {
  availableCount: number;
  choices: StampAsset[];
  status?: "loading" | "error" | "ready";
  newAssetIDs?: string[];
  unlock(asset: StampAsset): Promise<void>;
  viewNew?(): void | Promise<void>;
}

export interface TeamCanvasWidgetContract {
  version: typeof TEAM_CANVAS_WIDGET_CONTRACT_VERSION;
  identity: {
    teamID: string;
    playerID: string;
    avatar: AvatarConfiguration | null;
  };
  access: {
    state: TeamCanvasAccessState;
    error: string | null;
  };
  room: {
    localState: TeamCanvasState;
    projection: ConnectedTeamCanvasProjection | null;
    localSettings: TeamCanvasSettings;
    selectedPieceID: string | null;
  };
  inventory: TeamCanvasStampUnlockPort;
  actions: {
    moveAvatar(position: BoardPosition): void;
    placeStamp(asset: StampAsset): Promise<void>;
    togglePiece(pieceID: string): void;
    editPiece(pieceID: string, patch: Partial<BoardTransform>): void;
    deletePiece(pieceID: string): Promise<void>;
    clearPiece(): void;
    saveSettings(settings: TeamCanvasSettings): Promise<void>;
  };
  lifecycle: {
    connection: TeamCanvasConnectionState;
    reducedMotion: boolean;
  };
  telemetry: TeamCanvasTelemetry;
}

export function supportsTeamCanvasWidgetContract(
  value: unknown,
): value is TeamCanvasWidgetContract {
  if (!value || typeof value !== "object") return false;
  const contract = value as Record<string, unknown>;
  const identity = record(contract.identity);
  const access = record(contract.access);
  const room = record(contract.room);
  const inventory = record(contract.inventory);
  const actions = record(contract.actions);
  const lifecycle = record(contract.lifecycle);
  const telemetry = record(contract.telemetry);
  return (
    contract.version === TEAM_CANVAS_WIDGET_CONTRACT_VERSION &&
    typeof identity?.teamID === "string" &&
    typeof identity.playerID === "string" &&
    ["local", "loading", "locked", "ready", "error"].includes(
      String(access?.state),
    ) &&
    room?.localState !== undefined &&
    room.localSettings !== undefined &&
    Array.isArray(inventory?.choices) &&
    typeof inventory.unlock === "function" &&
    [
      "moveAvatar",
      "placeStamp",
      "togglePiece",
      "editPiece",
      "deletePiece",
      "clearPiece",
      "saveSettings",
    ].every((action) => typeof actions?.[action] === "function") &&
    [
      "local",
      "connecting",
      "connected",
      "reconnecting",
      "unavailable",
    ].includes(String(lifecycle?.connection)) &&
    typeof lifecycle?.reducedMotion === "boolean" &&
    ["reconnects", "correctionDistance", "hostEpoch", "droppedFrames"].every(
      (metric) => finite(telemetry?.[metric]),
    ) &&
    optionalFinite(telemetry?.inputToRenderMs) &&
    optionalFinite(telemetry?.checkpointAgeMs)
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalFinite(value: unknown) {
  return value === null || finite(value);
}
