"use client";

import { players, WEEKLY_GOAL } from "../data/mockData";
import { useOptionalTraining } from "../state/training-context";
import { MomentumStatus } from "../player/components/MomentumStatus";
import { usePlayerDevSettings } from "../player/dev/PlayerDevSettings";

export default function PlayerProgressPage() {
  const training = useOptionalTraining();
  const dev = usePlayerDevSettings();
  const prototype = players[0];
  const summary = training?.dashboard?.summary;
  return (
    <div className="player-page progress-page">
      <header>
        <p className="player-eyebrow">Progress</p>
        <h1>Your momentum</h1>
      </header>
      <MomentumStatus
        momentumScore={summary?.momentumScore ?? 68}
        weeklyCheckIns={
          summary?.weeklyMomentumCredits ?? prototype.weeklySessions
        }
        weeklyGoal={training?.dashboard?.team.weeklyGoal ?? WEEKLY_GOAL}
        checkInStreak={summary?.currentCheckInStreak ?? prototype.currentStreak}
        stateOverride={
          dev.settings.momentumBand === "real"
            ? undefined
            : dev.settings.momentumBand
        }
      />
    </div>
  );
}
