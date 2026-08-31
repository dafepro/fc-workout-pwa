"use client";

import { useEffect, useState } from "react";
import { copy } from "./content/copy";
import { useTraining } from "./state/training-context";
import { useAuth } from "./state/auth-context";
import { MomentumStatus } from "./player/MomentumStatus";
import { TodayAdditionalAction } from "./player/TodayAdditionalAction";
import { TodayPrimaryAction } from "./player/TodayPrimaryAction";
import { PlanWeekStrip } from "./player/PlanWeekStrip";

export default function HomePage() {
  const { runtime } = useAuth();
  const {
    connected,
    dashboard,
    dashboardStatus,
    refreshDashboard,
    recordPlannedRest,
  } = useTraining();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [celebrateCompletion, setCelebrateCompletion] = useState(false);
  const momentumScore = dashboard?.summary.momentumScore ?? 0;
  const checkInStreak = dashboard?.summary.currentCheckInStreak ?? 0;
  const assignment = dashboard?.currentAssignment ?? null;
  const assignmentComplete = assignment?.completed ?? false;
  const planDay = dashboard?.currentPlanDay ?? null;
  const currentPlan = dashboard?.currentPlan ?? null;
  const planOwnsToday = Boolean(planDay && currentPlan);
  const primaryComplete = planOwnsToday
    ? Boolean(planDay?.completed)
    : assignmentComplete;
  const isCelebrating = primaryComplete && celebrateCompletion;
  const assignmentActivity = dashboard?.activities.find(
    ({ id }) => id === assignment?.activityDefinitionId,
  );
  const teamWorkout =
    planOwnsToday && assignment && !assignment.completed && assignmentActivity
      ? {
          activityName: assignmentActivity.name,
          targetValue: assignment.targetValue,
          targetUnit: assignment.targetUnit,
          dueOn: assignment.dueOn,
        }
      : null;

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("saved") !== "1") {
      return;
    }
    window.history.replaceState(null, "", "/");
    const completed = parameters.get("completed") === "1";
    const showTimer = window.setTimeout(() => {
      setShowSavedToast(true);
      setCelebrateCompletion(completed);
    }, 0);
    const settleTimer = completed
      ? window.setTimeout(() => setCelebrateCompletion(false), 3600)
      : undefined;
    const hideTimer = window.setTimeout(() => setShowSavedToast(false), 4200);
    return () => {
      window.clearTimeout(showTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (connected && dashboardStatus === "loading") {
    return <main className="auth-state">Loading your training plan…</main>;
  }

  if (connected && (dashboardStatus === "error" || !dashboard)) {
    return (
      <main className="auth-state" role="alert">
        <h1>Your training plan could not be loaded</h1>
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
    <div className="page player-page player-page--today page--home">
      {showSavedToast ? (
        <div className="toast-overlay" role="status">
          <span aria-hidden="true">✓</span>
          <strong>{copy.saveSuccess}</strong>
        </div>
      ) : null}
      <MomentumStatus
        momentumScore={momentumScore}
        checkInStreak={checkInStreak}
      />

      <TodayPrimaryAction
        day={planDay}
        plan={currentPlan}
        assignment={assignment}
        activities={dashboard?.activities ?? []}
        onRecordRest={recordPlannedRest}
        celebrating={isCelebrating}
        teamName={dashboard?.team.name}
      />

      {currentPlan ? <PlanWeekStrip plan={currentPlan} /> : null}

      <TodayAdditionalAction
        teamLocked={!(dashboard?.teamPulse.unlocked ?? false)}
        teamWorkout={teamWorkout}
        prizeBoxesConnected={connected}
        prizeBoxGateway={runtime.prizeBoxes}
      />
    </div>
  );
}
