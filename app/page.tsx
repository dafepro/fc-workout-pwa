"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SessionList } from "./components/SessionList";
import { WorkoutInstructions } from "./components/WorkoutInstructions";
import { copy } from "./content/copy";
import { useTraining } from "./state/training-context";
import { useAuth } from "./state/auth-context";
import { MomentumStatus } from "./player/MomentumStatus";
import { TodayAdditionalAction } from "./player/TodayAdditionalAction";
import { TodayPlanHero } from "./player/TodayPlanHero";
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
  const assignmentActivity = dashboard?.activities.find(
    (activity) => activity.id === assignment?.activityDefinitionId,
  );
  const assignmentComplete = assignment?.completed ?? false;
  const planDay = dashboard?.currentPlanDay ?? null;
  const currentPlan = dashboard?.currentPlan ?? null;
  const primaryComplete = planDay?.completed ?? assignmentComplete;
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
    <div className="page page--home">
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

      {planDay && currentPlan ? (
        <TodayPlanHero
          day={planDay}
          dayNumber={currentPlan.dayNumber}
          dayCount={currentPlan.dayCount}
          activities={dashboard?.activities ?? []}
          onRecordRest={recordPlannedRest}
          celebrating={isCelebrating}
        />
      ) : (
        <section
          className={`hero-card ${assignmentComplete ? "hero-card--complete" : ""} ${isCelebrating ? "is-celebrating" : ""}`}
          aria-labelledby="assignment-title"
          aria-live={assignmentComplete ? "polite" : undefined}
        >
          <div className="hero-card__content">
            <p className="eyebrow eyebrow--lime">
              {assignmentComplete
                ? copy.completion.eyebrow
                : assignment
                  ? `Next workout · due ${assignment.dueOn}`
                  : "Approved training"}
            </p>
            <h1 id="assignment-title">
              {assignmentComplete
                ? copy.completion.title
                : (assignmentActivity?.name ?? "Choose a workout")}
            </h1>
            <p className="hero-card__detail">
              {assignmentComplete && assignmentActivity
                ? copy.completion.activity(assignmentActivity.name)
                : assignment
                  ? `${assignment.targetValue} ${assignment.targetUnit}`
                  : "Pick from your team’s activity list"}
              {!assignmentComplete && assignmentActivity?.qualifier ? (
                <>
                  {" "}
                  <span>×</span> {assignmentActivity.qualifier}
                </>
              ) : null}
            </p>
            {assignmentComplete ? (
              <>
                <p className="hero-card__support">
                  {copy.completion.teamContribution(
                    dashboard?.team.name ?? "your team",
                  )}
                </p>
                <Link className="button button--lime" href="/team">
                  {copy.completion.action} <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : (
              <Link className="button button--lime" href="/log">
                Log session <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          {assignmentActivity && !assignmentComplete ? (
            <WorkoutInstructions
              activityName={assignmentActivity.name}
              instructions={assignmentActivity.instructions}
            />
          ) : null}
          <div
            className={`hill-art ${assignmentComplete ? "hill-art--complete" : ""}`}
            aria-hidden="true"
          >
            <span className="hill-art__sun">✦</span>
            {assignmentComplete ? (
              <>
                <span className="completion-burst">
                  <i>✦</i>
                  <i>★</i>
                  <i>✦</i>
                </span>
                <span className="completion-check">✓</span>
              </>
            ) : null}
            <span className="hill-art__runner">🏃</span>
          </div>
        </section>
      )}

      {currentPlan ? <PlanWeekStrip plan={currentPlan} /> : null}

      {primaryComplete ? <TodayAdditionalAction /> : null}

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
