export type MomentumBand = "warming-up" | "building" | "rolling" | "strong";
export type DayKind = "training" | "rest";
export type Feeling = "good" | "tired" | "very-tired";
export type Workload = "moderate" | "hard" | "assessment" | "recovery";
export type CompletionChoice = "goal" | "stretch";
export type PlanSelection = "prescribed" | "ball-control" | "low-impact";
export type ExtraActivity = "ball-control" | "easy-walk" | "mobility";

export interface MomentumHistoryEntry {
  id: string;
  title: string;
  detail: string;
  kind: "primary" | "recovery" | "rest" | "extra";
  momentumEffect:
    | "full"
    | "small"
    | "partial"
    | "supportive"
    | "hold"
    | "history-only";
}

export interface MomentumState {
  version: 1;
  dayKind: DayKind;
  personalMomentum: number;
  teamContribution: number;
  primaryComplete: boolean;
  primaryChoice: CompletionChoice | null;
  planSelection: PlanSelection;
  feeling: Feeling | null;
  recoveryComplete: boolean;
  history: MomentumHistoryEntry[];
}

export interface TeamMomentumProjection {
  band: "building";
  recentPlanFollowers: number;
  highlightedPlayers: string[];
}

const MAX_MOMENTUM = 92;

export function initialMomentumState(): MomentumState {
  return {
    version: 1,
    dayKind: "training",
    personalMomentum: 68,
    teamContribution: 0,
    primaryComplete: false,
    primaryChoice: null,
    planSelection: "prescribed",
    feeling: null,
    recoveryComplete: false,
    history: [],
  };
}

export function completePlan(
  state: MomentumState,
  input: {
    choice: CompletionChoice;
    feeling: Feeling;
    planSelection?: PlanSelection;
  },
): MomentumState {
  if (state.primaryComplete) return state;

  const planSelection = input.planSelection ?? "prescribed";
  const baseEffect = planSelection === "ball-control" ? 7 : 12;
  const stretchEffect = input.choice === "stretch" ? 2 : 0;
  const teamContribution = planSelection === "ball-control" ? 0.5 : 1;
  const activity =
    planSelection === "prescribed"
      ? "Hill sprints"
      : planSelection === "ball-control"
        ? "Ball control circuit"
        : "Low-impact sprint substitute";
  const result =
    planSelection === "prescribed"
      ? input.choice === "stretch"
        ? "10 reps"
        : "8 reps"
      : planSelection === "ball-control"
        ? input.choice === "stretch"
          ? "15 minutes"
          : "12 minutes"
        : input.choice === "stretch"
          ? "10 rounds"
          : "8 rounds";

  return {
    ...state,
    planSelection,
    primaryComplete: true,
    primaryChoice: input.choice,
    feeling: input.feeling,
    personalMomentum: boundedMomentum(
      state.personalMomentum + baseEffect + stretchEffect,
    ),
    teamContribution: state.teamContribution + teamContribution,
    history: [
      ...state.history,
      {
        id: "mock-plan-2026-08-20-primary",
        title: activity,
        detail: result,
        kind: "primary",
        momentumEffect:
          planSelection === "ball-control"
            ? "partial"
            : input.choice === "stretch"
              ? "small"
              : "full",
      },
    ],
  };
}

export function logRecovery(state: MomentumState): MomentumState {
  if (!state.primaryComplete || state.recoveryComplete) return state;

  return {
    ...state,
    recoveryComplete: true,
    personalMomentum: boundedMomentum(state.personalMomentum + 3),
    history: [
      ...state.history,
      {
        id: "mock-plan-2026-08-20-recovery",
        title: "Easy recovery walk",
        detail: "10 minutes · relaxed",
        kind: "recovery",
        momentumEffect: "supportive",
      },
    ],
  };
}

export function logExtraActivity(
  state: MomentumState,
  activity: ExtraActivity,
): MomentumState {
  if (!state.primaryComplete) return state;

  const labels: Record<ExtraActivity, { title: string; detail: string }> = {
    "ball-control": {
      title: "Easy ball touches",
      detail: "10 minutes",
    },
    "easy-walk": { title: "Easy walk", detail: "15 minutes" },
    mobility: { title: "Mobility routine", detail: "8 minutes" },
  };

  return {
    ...state,
    history: [
      ...state.history,
      {
        id: `mock-extra-${state.history.length + 1}`,
        ...labels[activity],
        kind: "extra",
        momentumEffect: "history-only",
      },
    ],
  };
}

export function recordPlannedRest(state: MomentumState): MomentumState {
  if (state.primaryComplete) return state;

  return {
    ...state,
    dayKind: "rest",
    primaryComplete: true,
    teamContribution: state.teamContribution + 1,
    history: [
      ...state.history,
      {
        id: "mock-plan-2026-08-20-rest",
        title: "Planned rest",
        detail: "Plan followed",
        kind: "rest",
        momentumEffect: "hold",
      },
    ],
  };
}

export function nextSuggestedWorkload(
  completed: Workload,
  feeling: Feeling,
): "moderate" | "recovery" {
  if (
    completed === "hard" ||
    completed === "assessment" ||
    feeling === "very-tired"
  ) {
    return "recovery";
  }
  return "moderate";
}

export function momentumBand(value: number): MomentumBand {
  if (value < 25) return "warming-up";
  if (value < 55) return "building";
  if (value < 80) return "rolling";
  return "strong";
}

export function teamMomentumProjection(
  state: MomentumState,
): TeamMomentumProjection {
  return {
    band: "building",
    recentPlanFollowers: 8 + (state.teamContribution > 0 ? 1 : 0),
    highlightedPlayers: ["Ari", "Elena", "Noah", "Zoe"],
  };
}

export function isMomentumState(value: unknown): value is MomentumState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MomentumState>;
  return (
    state.version === 1 &&
    (state.dayKind === "training" || state.dayKind === "rest") &&
    typeof state.personalMomentum === "number" &&
    state.personalMomentum >= 0 &&
    state.personalMomentum <= MAX_MOMENTUM &&
    typeof state.teamContribution === "number" &&
    typeof state.primaryComplete === "boolean" &&
    typeof state.recoveryComplete === "boolean" &&
    Array.isArray(state.history)
  );
}

function boundedMomentum(value: number): number {
  return Math.max(0, Math.min(MAX_MOMENTUM, value));
}
