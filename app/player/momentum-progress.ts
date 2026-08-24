export type MomentumProgressState =
  | "ready"
  | "started"
  | "building"
  | "on-a-roll";

export interface MomentumProgress {
  score: number;
  percentage: number;
  state: MomentumProgressState;
}

export function momentumProgress(momentumScore: number): MomentumProgress {
  const score = Math.min(100, Math.max(0, Math.round(momentumScore * 10) / 10));

  return {
    score,
    percentage: score,
    state:
      score >= 65
        ? "on-a-roll"
        : score >= 25
          ? "building"
          : score === 0
            ? "ready"
            : "started",
  };
}
