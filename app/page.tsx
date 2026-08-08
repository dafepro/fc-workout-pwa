"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./components/Avatar";
import { ProgressBar } from "./components/ProgressBar";
import { SessionList } from "./components/SessionList";
import { WorkoutInstructions } from "./components/WorkoutInstructions";
import { copy } from "./content/copy";
import { players, WEEKLY_GOAL } from "./data/mockData";
import { activityDays, currentStreak, entriesWithinDays } from "./domain/rules";
import { useTraining } from "./state/training-context";
import { useAuth } from "./state/auth-context";

export default function HomePage() {
  const {
    connected,
    dashboard,
    dashboardStatus,
    entries,
    entriesStatus,
    refreshDashboard,
    refreshEntries,
  } = useTraining();
  const { currentPlayerID } = useAuth();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [celebrateCompletion, setCelebrateCompletion] = useState(false);
  const [showQuip, setShowQuip] = useState(false);
  const personalEntries = entries.filter(
    (entry) => entry.playerId === currentPlayerID,
  );
  const weeklyEntries = entriesWithinDays(personalEntries, 7);
  const summary = connected ? dashboard?.summary : null;
  const monthDays = summary?.activityDays ?? activityDays(personalEntries);
  const streak = summary?.currentStreak ?? currentStreak(personalEntries);
  const longestStreak = summary?.longestStreak ?? 12;
  const effortPoints = summary?.effortPoints ?? 520;
  const weeklyGoal = dashboard?.team.weeklyGoal ?? WEEKLY_GOAL;
  const weeklySessions = summary?.weeklySessions ?? weeklyEntries.length;
  const goalValue = Math.min(weeklySessions, weeklyGoal);
  const assignment = dashboard?.currentAssignment ?? null;
  const assignmentActivity = dashboard?.activities.find(
    (activity) => activity.id === assignment?.activityDefinitionId,
  );
  const assignmentComplete = assignment?.completed ?? false;
  const isCelebrating = assignmentComplete && celebrateCompletion;
  const streakQuip = dashboard?.streakComparison.message;

  function revealStreakQuip() {
    setShowQuip(true);
  }

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
            {!assignmentComplete &&
            assignment?.catalogKey === "hill_sprints_8x6" ? (
              <>
                {" "}
                <span>×</span> 6 seconds
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

      <section
        className={`goal-card ${isCelebrating ? "goal-card--celebrating" : ""}`}
      >
        <div>
          <p className="eyebrow">Weekly goal</p>
          <h2>
            {goalValue} <span>of {weeklyGoal}</span>
          </h2>
          <p>
            {goalValue >= weeklyGoal
              ? "Goal met—nice work!"
              : `${weeklyGoal - goalValue} more session to hit your goal.`}
          </p>
        </div>
        <div className="goal-card__progress">
          <strong>{Math.round((goalValue / weeklyGoal) * 100)}%</strong>
          <ProgressBar
            value={goalValue}
            max={weeklyGoal}
            label="Weekly goal progress"
          />
        </div>
      </section>

      <section className="metrics-grid" aria-label="Personal training summary">
        <article className="streak-card">
          <button
            type="button"
            className="streak-card__trigger"
            onClick={revealStreakQuip}
            onPointerEnter={revealStreakQuip}
            aria-describedby={showQuip ? "streak-quip" : undefined}
          >
            <span aria-hidden="true">🔥</span>
            <strong>{streak}</strong>
            <span>Current streak</span>
          </button>
          {showQuip && streakQuip ? (
            <p className="streak-quip" id="streak-quip" role="status">
              {streakQuip}
            </p>
          ) : null}
        </article>
        <article>
          <span aria-hidden="true">🏆</span>
          <strong>{longestStreak}</strong>
          <p>Longest streak</p>
        </article>
        <article>
          <span aria-hidden="true">⚡</span>
          <strong>{effortPoints}</strong>
          <p>Effort points</p>
        </article>
        <article className="activity-calendar-card">
          <span aria-hidden="true">◆</span>
          <strong>Last 30 days</strong>
          <div
            className="activity-calendar"
            aria-label="Training activity over the last 30 days"
          >
            {monthDays.map((day) => {
              const dateLabel = new Date(
                `${day.date}T12:00:00`,
              ).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              const sessionLabel = `${day.activityCount} ${
                day.activityCount === 1 ? "session" : "sessions"
              }`;
              return (
                <span
                  key={day.date}
                  className={`activity-calendar__day activity-calendar__day--${day.level}`}
                  role="img"
                  aria-label={`${dateLabel}: ${sessionLabel}`}
                  title={`${dateLabel}: ${sessionLabel}`}
                />
              );
            })}
          </div>
        </article>
      </section>

      <SessionList
        entries={personalEntries}
        activities={dashboard?.activities ?? []}
      />

      <section className="card team-preview">
        <div>
          <p className="eyebrow">Team pulse</p>
          <h2>
            {dashboard?.teamPulse.activeThisWeek ?? 8} teammates showed up this
            week
          </h2>
          <p>Your crew is building momentum together.</p>
        </div>
        <div
          className="avatar-stack"
          aria-label="Teammates who completed today's challenge"
        >
          {!connected
            ? players
                .slice(1, 6)
                .map((teammate) => (
                  <Avatar
                    key={teammate.id}
                    player={teammate}
                    size="small"
                    completed
                  />
                ))
            : null}
          {!connected ? (
            <span className="avatar avatar--small avatar--more">+3</span>
          ) : null}
        </div>
        <Link className="button button--outline" href="/team">
          Team activity
        </Link>
      </section>
    </div>
  );
}
