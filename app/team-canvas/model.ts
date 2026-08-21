export type DayKind = "training" | "rest";
export type CompletionKind = "goal" | "reach" | "approved-alternative";
export type RewardSource = "reach" | "cooldown";
export type ExtraActivity = "ball-touches" | "easy-walk" | "mobility";

export interface BoardPosition {
  x: number;
  y: number;
}

export interface BoardTransform extends BoardPosition {
  size: number;
  rotation: number;
}

export type StampAsset =
  | { id: string; kind: "emoji"; glyph: string; label: string }
  | { id: string; kind: "image"; src: string; alt: string }
  | {
      id: string;
      kind: "sprite";
      src: string;
      alt: string;
      frames: number;
      frameWidth: number;
      frameHeight: number;
    };

export interface BoardPiece extends BoardTransform {
  id: string;
  dayKey: string;
  ownerId: string;
  asset: StampAsset;
  status: "live" | "pasted";
}

export interface ProjectedBoardPiece extends BoardTransform {
  id: string;
  dayKey: string;
  asset: StampAsset;
  status: "live" | "pasted";
  editable: boolean;
}

export interface TeamCanvasHistoryEntry {
  id: string;
  dayKey: string;
  title: string;
  detail: string;
  kind: "primary" | "rest" | "cooldown" | "extra";
}

export interface TeamCanvasState {
  version: 2;
  teamId: string;
  weekKey: string;
  dayKey: string;
  dayKind: DayKind;
  primaryComplete: boolean;
  completion: CompletionKind | "rest" | null;
  effort: number | null;
  tiredness: number | null;
  cooldownComplete: boolean;
  completedDayKeys: string[];
  earnedRewardSources: RewardSource[];
  spentRewardSources: RewardSource[];
  avatarPosition: BoardPosition;
  boardPieces: BoardPiece[];
  selectedPieceId: string | null;
  history: TeamCanvasHistoryEntry[];
}

export interface TeamCanvasProjection {
  starDayKeys: string[];
  avatarPosition: BoardPosition;
  pieces: ProjectedBoardPiece[];
}

const CURRENT_PLAYER_ID = "mason";
const TEXT_STYLES = ["block", "rally", "speed", "outline"] as const;

export function initialTeamCanvasState(): TeamCanvasState {
  return {
    version: 2,
    teamId: "team-hill-striders",
    weekKey: "2026-08-17",
    dayKey: "2026-08-20",
    dayKind: "training",
    primaryComplete: false,
    completion: null,
    effort: null,
    tiredness: null,
    cooldownComplete: false,
    completedDayKeys: [],
    earnedRewardSources: [],
    spentRewardSources: [],
    avatarPosition: { x: 50, y: 72 },
    boardPieces: [],
    selectedPieceId: null,
    history: [],
  };
}

export function beginDay(
  state: TeamCanvasState,
  input: { dayKey: string; dayKind: DayKind },
): TeamCanvasState {
  const weekKey = weekKeyForDay(input.dayKey);
  const sameWeek = weekKey === state.weekKey;

  return {
    ...state,
    weekKey,
    dayKey: input.dayKey,
    dayKind: input.dayKind,
    primaryComplete: false,
    completion: null,
    effort: null,
    tiredness: null,
    cooldownComplete: false,
    completedDayKeys: sameWeek ? state.completedDayKeys : [],
    earnedRewardSources: [],
    spentRewardSources: [],
    avatarPosition: sameWeek ? state.avatarPosition : { x: 50, y: 72 },
    boardPieces: sameWeek
      ? state.boardPieces.map((piece) =>
          piece.status === "live" && piece.dayKey !== input.dayKey
            ? { ...piece, status: "pasted" as const }
            : piece,
        )
      : [],
    selectedPieceId: null,
  };
}

export function recordPrimary(
  state: TeamCanvasState,
  input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
  },
): TeamCanvasState {
  if (state.primaryComplete || state.dayKind !== "training") return state;

  const rewardSources: RewardSource[] =
    input.completion === "reach" ? ["reach"] : [];
  const detail =
    input.completion === "goal"
      ? "Goal followed"
      : input.completion === "reach"
        ? "Reach followed"
        : "Coach-approved alternative";

  return {
    ...state,
    primaryComplete: true,
    completion: input.completion,
    effort: clamp(Math.round(input.effort), 1, 7),
    tiredness: clamp(Math.round(input.tiredness), 1, 7),
    completedDayKeys: addUnique(state.completedDayKeys, state.dayKey),
    earnedRewardSources: rewardSources,
    history: [
      ...state.history,
      {
        id: historyId(state, "primary"),
        dayKey: state.dayKey,
        title:
          input.completion === "approved-alternative"
            ? "Approved alternative"
            : "Hill sprints",
        detail,
        kind: "primary",
      },
    ],
  };
}

export function recordPlannedRest(state: TeamCanvasState): TeamCanvasState {
  if (state.primaryComplete || state.dayKind !== "rest") return state;

  return {
    ...state,
    primaryComplete: true,
    completion: "rest",
    completedDayKeys: addUnique(state.completedDayKeys, state.dayKey),
    history: [
      ...state.history,
      {
        id: historyId(state, "rest"),
        dayKey: state.dayKey,
        title: "Planned rest",
        detail: "Plan followed",
        kind: "rest",
      },
    ],
  };
}

export function recordCooldown(state: TeamCanvasState): TeamCanvasState {
  if (
    !state.primaryComplete ||
    state.dayKind !== "training" ||
    state.cooldownComplete
  ) {
    return state;
  }

  return {
    ...state,
    cooldownComplete: true,
    earnedRewardSources: addUnique(state.earnedRewardSources, "cooldown"),
    history: [
      ...state.history,
      {
        id: historyId(state, "cooldown"),
        dayKey: state.dayKey,
        title: "Easy recovery walk",
        detail: "10 minutes · relaxed",
        kind: "cooldown",
      },
    ],
  };
}

export function logExtraActivity(
  state: TeamCanvasState,
  activity: ExtraActivity,
): TeamCanvasState {
  const labels: Record<ExtraActivity, { title: string; detail: string }> = {
    "ball-touches": { title: "Easy ball touches", detail: "10 minutes" },
    "easy-walk": { title: "Easy walk", detail: "15 minutes" },
    mobility: { title: "Mobility routine", detail: "8 minutes" },
  };

  return {
    ...state,
    history: [
      ...state.history,
      {
        id: historyId(state, "extra"),
        dayKey: state.dayKey,
        ...labels[activity],
        kind: "extra",
      },
    ],
  };
}

export function teamCanvasUnlocked(state: TeamCanvasState): boolean {
  return state.primaryComplete;
}

export function availableRewardCount(state: TeamCanvasState): number {
  return Math.min(
    2,
    Math.max(
      0,
      state.earnedRewardSources.length - state.spentRewardSources.length,
    ),
  );
}

export function dailyStampSet(teamId: string, dayKey: string): StampAsset[] {
  const available = [...TEAM_CANVAS_STAMPS];
  const result: StampAsset[] = [];
  let seed = hash(`${teamId}:${dayKey}`);

  while (result.length < 5) {
    seed = nextSeed(seed);
    const index = seed % available.length;
    result.push(available.splice(index, 1)[0]);
  }
  return result;
}

export function weeklyTextStyle(
  teamId: string,
  weekKey: string,
): (typeof TEXT_STYLES)[number] {
  return TEXT_STYLES[hash(`${teamId}:${weekKey}`) % TEXT_STYLES.length];
}

export function addLivePiece(
  state: TeamCanvasState,
  requestedAsset: StampAsset,
): TeamCanvasState {
  if (availableRewardCount(state) === 0) return state;
  const asset = dailyStampSet(state.teamId, state.dayKey).find(
    ({ id }) => id === requestedAsset.id,
  );
  const nextSource = state.earnedRewardSources.find(
    (source) => !state.spentRewardSources.includes(source),
  );
  if (!asset || !nextSource) return state;

  const ownedToday = state.boardPieces.filter(
    (piece) =>
      piece.ownerId === CURRENT_PLAYER_ID && piece.dayKey === state.dayKey,
  ).length;
  const piece: BoardPiece = {
    id: nextPieceId(state),
    dayKey: state.dayKey,
    ownerId: CURRENT_PLAYER_ID,
    asset,
    status: "live",
    x: 46 + ownedToday * 12,
    y: 42 + ownedToday * 10,
    size: 44,
    rotation: 0,
  };

  return {
    ...state,
    spentRewardSources: [...state.spentRewardSources, nextSource],
    boardPieces: [...state.boardPieces, piece],
    selectedPieceId: piece.id,
  };
}

export function selectOwnedPiece(
  state: TeamCanvasState,
  pieceId: string,
): TeamCanvasState {
  const piece = state.boardPieces.find(({ id }) => id === pieceId);
  return piece && isEditablePiece(piece, state.dayKey, CURRENT_PLAYER_ID)
    ? { ...state, selectedPieceId: pieceId }
    : state;
}

export function clearPieceSelection(state: TeamCanvasState): TeamCanvasState {
  return state.selectedPieceId ? { ...state, selectedPieceId: null } : state;
}

export function updateOwnedPiece(
  state: TeamCanvasState,
  pieceId: string,
  patch: Partial<BoardTransform>,
): TeamCanvasState {
  const index = state.boardPieces.findIndex(({ id }) => id === pieceId);
  const current = state.boardPieces[index];
  if (!current || !isEditablePiece(current, state.dayKey, CURRENT_PLAYER_ID)) {
    return state;
  }
  const next = { ...current, ...patch };
  const boardPieces = [...state.boardPieces];
  boardPieces[index] = {
    ...next,
    x: clamp(next.x, 6, 94),
    y: clamp(next.y, 6, 94),
    size: clamp(next.size, 28, 76),
    rotation: normalizeRotation(next.rotation),
  };

  return { ...state, boardPieces, selectedPieceId: pieceId };
}

export function deleteOwnedPiece(
  state: TeamCanvasState,
  pieceId: string,
): TeamCanvasState {
  const piece = state.boardPieces.find(({ id }) => id === pieceId);
  if (!piece || !isEditablePiece(piece, state.dayKey, CURRENT_PLAYER_ID)) {
    return state;
  }
  return {
    ...state,
    boardPieces: state.boardPieces.filter(({ id }) => id !== pieceId),
    spentRewardSources: state.spentRewardSources.slice(0, -1),
    selectedPieceId:
      state.selectedPieceId === pieceId ? null : state.selectedPieceId,
  };
}

export function moveOwnAvatar(
  state: TeamCanvasState,
  position: BoardPosition,
): TeamCanvasState {
  return {
    ...state,
    avatarPosition: {
      x: clamp(position.x, 6, 94),
      y: clamp(position.y, 6, 94),
    },
  };
}

export function teamCanvasProjection(
  state: TeamCanvasState,
  currentPlayerId = CURRENT_PLAYER_ID,
): TeamCanvasProjection | null {
  if (!teamCanvasUnlocked(state)) return null;
  return {
    starDayKeys: state.completedDayKeys.slice(-7),
    avatarPosition: state.avatarPosition,
    pieces: state.boardPieces.map((piece) => ({
      id: piece.id,
      dayKey: piece.dayKey,
      asset: piece.asset,
      status: piece.status,
      editable: isEditablePiece(piece, state.dayKey, currentPlayerId),
      x: piece.x,
      y: piece.y,
      size: piece.size,
      rotation: piece.rotation,
    })),
  };
}

export function isTeamCanvasState(value: unknown): value is TeamCanvasState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TeamCanvasState>;
  return (
    state.version === 2 &&
    typeof state.teamId === "string" &&
    typeof state.weekKey === "string" &&
    typeof state.dayKey === "string" &&
    (state.dayKind === "training" || state.dayKind === "rest") &&
    typeof state.primaryComplete === "boolean" &&
    Array.isArray(state.completedDayKeys) &&
    Array.isArray(state.earnedRewardSources) &&
    Array.isArray(state.spentRewardSources) &&
    Array.isArray(state.boardPieces) &&
    state.boardPieces.every(isBoardPiece) &&
    (typeof state.selectedPieceId === "string" ||
      state.selectedPieceId === null) &&
    Array.isArray(state.history)
  );
}

function isEditablePiece(
  piece: BoardPiece,
  dayKey: string,
  currentPlayerId: string,
): boolean {
  return (
    piece.ownerId === currentPlayerId &&
    piece.dayKey === dayKey &&
    piece.status === "live"
  );
}

function isBoardPiece(value: unknown): value is BoardPiece {
  if (!value || typeof value !== "object") return false;
  const piece = value as Partial<BoardPiece>;
  return (
    typeof piece.id === "string" &&
    typeof piece.dayKey === "string" &&
    typeof piece.ownerId === "string" &&
    (piece.status === "live" || piece.status === "pasted") &&
    typeof piece.x === "number" &&
    typeof piece.y === "number" &&
    typeof piece.size === "number" &&
    typeof piece.rotation === "number" &&
    isStampAsset(piece.asset)
  );
}

function isStampAsset(value: unknown): value is StampAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<StampAsset>;
  if (typeof asset.id !== "string") return false;
  if (asset.kind === "emoji") {
    return typeof asset.glyph === "string" && typeof asset.label === "string";
  }
  if (asset.kind === "image") {
    return typeof asset.src === "string" && typeof asset.alt === "string";
  }
  return (
    asset.kind === "sprite" &&
    typeof asset.src === "string" &&
    typeof asset.alt === "string" &&
    typeof asset.frames === "number" &&
    typeof asset.frameWidth === "number" &&
    typeof asset.frameHeight === "number"
  );
}

function weekKeyForDay(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function historyId(state: TeamCanvasState, kind: string): string {
  return `${state.dayKey}-${kind}-${state.history.length + 1}`;
}

function addUnique<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items : [...items, item];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRotation(value: number): number {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function nextPieceId(state: TeamCanvasState): string {
  const prefix = `piece-${state.dayKey}-`;
  let sequence = 1;
  while (state.boardPieces.some(({ id }) => id === `${prefix}${sequence}`)) {
    sequence++;
  }
  return `${prefix}${sequence}`;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function nextSeed(value: number): number {
  return (Math.imul(value, 1664525) + 1013904223) >>> 0;
}
import { TEAM_CANVAS_STAMPS } from "./catalog";
