"use client";

import { useEffect, useState } from "react";
import { SessionList } from "./components/SessionList";
import { copy } from "./content/copy";
import { useTraining } from "./state/training-context";
import { useAuth } from "./state/auth-context";
import { MomentumStatus } from "./player/MomentumStatus";
import { TodayAdditionalAction } from "./player/TodayAdditionalAction";
import { TodayPrimaryAction } from "./player/TodayPrimaryAction";
import { PlanWeekStrip } from "./player/PlanWeekStrip";
import { TeamPulse } from "./player/TeamPulse";

export default function HomePage() {
  const {
    connected,
    dashboard,
    dashboardStatus,
    entries,
    entriesStatus,
    refreshDashboard,
    refreshEntries,
    recordPlannedRest,
  } = useTraining();
  const { currentPlayerID } = useAuth();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [celebrateCompletion, setCelebrateCompletion] = useState(false);
  const personalEntries = entries.filter(
    (entry) => entry.playerId === currentPlayerID,
  );
  const momentumScore = dashboard?.summary.momentumScore ?? 0;
  const checkInStreak = dashboard?.summary.currentCheckInStreak ?? 0;
  const assignment = dashboard?.currentAssignment ?? null;
  const assignmentComplete = assignment?.completed ?? false;
  const planDay = dashboard?.currentPlanDay ?? null;
  const currentPlan = dashboard?.currentPlan ?? null;
  const primaryComplete =
    planDay && !planDay.completed
      ? false
      : assignment && !assignmentComplete
        ? false
        : Boolean(planDay?.completed || assignmentComplete);
  const isCelebrating = primaryComplete && celebrateCompletion;

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("saved") !== "1") {
      return;
    }
    window.history.replaceState(null, "", "/");
    const showTimer = window.setTimeout(() => {
      setShowSavedToast(true);
      setCelebrateCompletion(parameters.get("completed") === "1");
    }, 0);
    const hideTimer = window.setTimeout(() => setShowSavedToast(false), 4200);
    return () => {
      window.clearTimeout(showTimer);
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
      {entriesStatus === "error" ? (
        <div className="notice notice--error" role="alert">
          <strong>Your sessions could not be loaded.</strong>
          <button type="button" onClick={() => void refreshEntries()}>
            Try again
          </button>
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

      <TodayAdditionalAction showAdditionalWorkout={primaryComplete} />

      <SessionList
        entries={personalEntries}
        activities={dashboard?.activities ?? []}
      />

      <TeamPulse
        projection={dashboard?.teamPulse ?? localTeamPulseProjection}
      />
    </div>
  );
}

const localTeamPulseProjection = {
  activeThisWeek: 0,
  unlocked: false,
  recentActivities: [],
};
