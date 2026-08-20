export type MomentumEvent =
  | "prescribed-goal"
  | "prescribed-stretch"
  | "approved-alternative"
  | "equivalent-substitution"
  | "paired-recovery"
  | "planned-rest"
  | "extra-log";

export type PersonalMomentumEffect =
  | "full"
  | "small"
  | "partial"
  | "supportive"
  | "hold"
  | "none";

export type TeamVisibility = "normalized-only" | "aggregate-only" | "none";

export interface MomentumImpact {
  personalEffect: PersonalMomentumEffect;
  gaugeDelta: number;
  teamContribution: number;
  resultRequired: boolean;
  teamVisibility: TeamVisibility;
}

export type MomentumBand = "warming-up" | "building" | "rolling" | "strong";
export type CompletedWork =
  | "moderate"
  | "hard"
  | "assessment"
  | "recovery"
  | "rest";

const MOMENTUM_IMPACTS: Record<MomentumEvent, MomentumImpact> = {
  "prescribed-goal": {
    personalEffect: "full",
    gaugeDelta: 12,
    teamContribution: 1,
    resultRequired: true,
    teamVisibility: "normalized-only",
  },
  "prescribed-stretch": {
    personalEffect: "small",
    gaugeDelta: 2,
    teamContribution: 0,
    resultRequired: true,
    teamVisibility: "none",
  },
  "approved-alternative": {
    personalEffect: "partial",
    gaugeDelta: 7,
    teamContribution: 0.5,
    resultRequired: true,
    teamVisibility: "normalized-only",
  },
  "equivalent-substitution": {
    personalEffect: "full",
    gaugeDelta: 12,
    teamContribution: 1,
    resultRequired: true,
    teamVisibility: "normalized-only",
  },
  "paired-recovery": {
    personalEffect: "supportive",
    gaugeDelta: 3,
    teamContribution: 0,
    resultRequired: true,
    teamVisibility: "none",
  },
  "planned-rest": {
    personalEffect: "hold",
    gaugeDelta: 0,
    teamContribution: 1,
    resultRequired: false,
    teamVisibility: "aggregate-only",
  },
  "extra-log": {
    personalEffect: "none",
    gaugeDelta: 0,
    teamContribution: 0,
    resultRequired: true,
    teamVisibility: "none",
  },
};

const MOMENTUM_CEILING = 92;

export function momentumImpact(event: MomentumEvent): MomentumImpact {
  return MOMENTUM_IMPACTS[event];
}

export function applyMomentumImpact(
  currentGauge: number,
  event: MomentumEvent,
): number {
  return Math.min(
    MOMENTUM_CEILING,
    Math.max(0, currentGauge + momentumImpact(event).gaugeDelta),
  );
}

export function gaugeBand(value: number): MomentumBand {
  if (value < 25) return "warming-up";
  if (value < 55) return "building";
  if (value < 80) return "rolling";
  return "strong";
}

export function nextWorkload({
  completed,
  exhaustion,
}: {
  completed: CompletedWork;
  exhaustion: number;
}): "moderate" | "recovery" {
  if (completed === "hard" || completed === "assessment" || exhaustion >= 6) {
    return "recovery";
  }

  return "moderate";
}
