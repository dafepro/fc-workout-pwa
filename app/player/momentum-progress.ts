export type MomentumProgressState =
  | "ready"
  | "started"
  | "building"
  | "on-a-roll";

export interface MomentumProgress {
  weeklySessions: number;
  weeklyGoal: number;
  gaugeValue: number;
  percentage: number;
  remaining: number;
  state: MomentumProgressState;
}

export function momentumProgress(
  weeklySessions: number,
  weeklyGoal: number,
): MomentumProgress {
  const sessions = Math.max(0, Math.floor(weeklySessions));
  const goal = Math.max(1, Math.floor(weeklyGoal));
  const gaugeValue = Math.min(sessions, goal);
  const remaining = Math.max(0, goal - sessions);

  return {
    weeklySessions: sessions,
    weeklyGoal: goal,
    gaugeValue,
    percentage: Math.round((gaugeValue / goal) * 100),
    remaining,
    state:
      remaining === 0
        ? "on-a-roll"
        : sessions === 0
          ? "ready"
          : sessions === 1
            ? "started"
            : "building",
  };
}
