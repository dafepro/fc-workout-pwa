export type MomentumState = "ready" | "started" | "building" | "on-a-roll";

export function momentumProgress(momentumScore: number): {
  score: number;
  percentage: number;
  state: MomentumState;
} {
  const finiteScore = Number.isFinite(momentumScore) ? momentumScore : 0;
  const score = Math.round(Math.min(100, Math.max(0, finiteScore)) * 10) / 10;
  const state =
    score === 0
      ? "ready"
      : score < 25
        ? "started"
        : score < 65
          ? "building"
          : "on-a-roll";

  return { score, percentage: score, state };
}
