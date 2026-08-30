"use client";

import { MomentumDetail } from "../player/MomentumDetail";
import { useTraining } from "../state/training-context";

export default function PlayerProgressPage() {
  const { dashboard, dashboardStatus, refreshDashboard } = useTraining();
  if (dashboardStatus === "loading") {
    return <main className="auth-state">Loading your momentum…</main>;
  }
  if (!dashboard) {
    return (
      <main className="auth-state" role="alert">
        <h1>Your momentum could not be loaded</h1>
        <button
          className="button button--lime"
          onClick={() => void refreshDashboard()}
        >
          Try again
        </button>
      </main>
    );
  }
  return (
    <div className="player-page progress-page">
      <header>
        <p className="eyebrow">Progress</p>
        <h1>Your momentum</h1>
      </header>
      <MomentumDetail
        momentumScore={dashboard.summary.momentumScore}
        weeklyCheckIns={dashboard.summary.weeklyMomentumCredits}
        weeklyGoal={dashboard.team.weeklyGoal}
        checkInStreak={dashboard.summary.currentCheckInStreak}
      />
    </div>
  );
}
