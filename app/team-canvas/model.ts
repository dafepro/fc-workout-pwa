export type DayKind = "training" | "rest";
export type CompletionKind = "goal" | "reach" | "approved-alternative";
export type RewardSource = "reach" | "cooldown";
export type ExtraActivity = "ball-touches" | "easy-walk" | "mobility";

export interface BoardPosition {
  x: number;
  y: number;
}

export interface EmojiDraft extends BoardPosition {
  emoji: string;
  size: number;
  rotation: number;
}

export interface EmojiPlacement extends EmojiDraft {
  id: string;
  dayKey: string;
  locked: true;
}

export interface TeamCanvasHistoryEntry {
  id: string;
  dayKey: string;
  title: string;
  detail: string;
  kind: "primary" | "rest" | "cooldown" | "extra";
}

export interface TeamCanvasState {
  version: 1;
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
  emojiDraft: EmojiDraft | null;
  emojiPlacements: EmojiPlacement[];
  history: TeamCanvasHistoryEntry[];
}

export interface TeamCanvasProjection {
  starCount: number;
  avatarPosition: BoardPosition;
  emojiPlacements: EmojiPlacement[];
}

const EMOJI_CATALOG = [
  "⚡",
  "🔥",
  "🌟",
  "🚀",
  "🦁",
  "🐆",
  "🛡️",
  "🎯",
  "⚽",
  "🌈",
  "💪",
  "🏃",
  "🦅",
  "🎉",
  "✨",
] as const;

const TEXT_STYLES = ["block", "rally", "speed", "outline"] as const;

export function initialTeamCanvasState(): TeamCanvasState {
  return {
    version: 1,
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
    emojiDraft: null,
    emojiPlacements: [],
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
    emojiDraft: null,
    emojiPlacements: sameWeek ? state.emojiPlacements : [],
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

  const rewardSources =
    input.completion === "reach" ? addUnique([], "reach") : [];
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

export function dailyEmojiSet(teamId: string, dayKey: string): string[] {
  const available = [...EMOJI_CATALOG];
  const result: string[] = [];
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

export function selectEmoji(
  state: TeamCanvasState,
  emoji: string,
): TeamCanvasState {
  if (
    availableRewardCount(state) === 0 ||
    !dailyEmojiSet(state.teamId, state.dayKey).includes(emoji)
  ) {
    return state;
  }

  return {
    ...state,
    emojiDraft: {
      emoji,
      x: 50,
      y: 42,
      size: 44,
      rotation: 0,
    },
  };
}

export function updateEmojiDraft(
  state: TeamCanvasState,
  patch: Partial<Omit<EmojiDraft, "emoji">>,
): TeamCanvasState {
  if (!state.emojiDraft) return state;
  const next = { ...state.emojiDraft, ...patch };

  return {
    ...state,
    emojiDraft: {
      ...next,
      x: clamp(next.x, 6, 94),
      y: clamp(next.y, 6, 94),
      size: clamp(next.size, 28, 64),
      rotation: clamp(next.rotation, -45, 45),
    },
  };
}

export function discardEmojiDraft(state: TeamCanvasState): TeamCanvasState {
  return state.emojiDraft ? { ...state, emojiDraft: null } : state;
}

export function confirmEmoji(state: TeamCanvasState): TeamCanvasState {
  if (!state.emojiDraft || availableRewardCount(state) === 0) return state;
  const nextSource = state.earnedRewardSources.find(
    (source) => !state.spentRewardSources.includes(source),
  );
  if (!nextSource) return state;

  return {
    ...state,
    emojiDraft: null,
    spentRewardSources: [...state.spentRewardSources, nextSource],
    emojiPlacements: [
      ...state.emojiPlacements,
      {
        ...state.emojiDraft,
        id: `stamp-${state.dayKey}-${state.emojiPlacements.length + 1}`,
        dayKey: state.dayKey,
        locked: true,
      },
    ],
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
): TeamCanvasProjection | null {
  if (!teamCanvasUnlocked(state)) return null;
  return {
    starCount: Math.min(7, state.completedDayKeys.length),
    avatarPosition: state.avatarPosition,
    emojiPlacements: state.emojiPlacements.map((placement) => ({
      id: placement.id,
      dayKey: placement.dayKey,
      emoji: placement.emoji,
      x: placement.x,
      y: placement.y,
      size: placement.size,
      rotation: placement.rotation,
      locked: true,
    })),
  };
}

export function isTeamCanvasState(value: unknown): value is TeamCanvasState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TeamCanvasState>;
  return (
    state.version === 1 &&
    typeof state.teamId === "string" &&
    typeof state.weekKey === "string" &&
    typeof state.dayKey === "string" &&
    (state.dayKind === "training" || state.dayKind === "rest") &&
    typeof state.primaryComplete === "boolean" &&
    Array.isArray(state.completedDayKeys) &&
    Array.isArray(state.earnedRewardSources) &&
    Array.isArray(state.spentRewardSources) &&
    Array.isArray(state.emojiPlacements) &&
    Array.isArray(state.history)
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
