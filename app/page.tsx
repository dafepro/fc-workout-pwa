"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./components/Avatar";
import { ProgressBar } from "./components/ProgressBar";
import { SessionList } from "./components/SessionList";
import { WorkoutInstructions } from "./components/WorkoutInstructions";
import { copy } from "./content/copy";
import { players, WEEKLY_GOAL } from "./data/mockData";
import {
  activityDays,
  currentStreak,
  entriesWithinDays,
  streakQuipValue,
} from "./domain/rules";
import { useTraining } from "./state/training-context";
import { useAuth } from "./state/auth-context";

export default function HomePage() {
  const { entries, entriesStatus, refreshEntries } = useTraining();
  const { currentPlayer: player, currentPlayerID } = useAuth();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [quipIndex, setQuipIndex] = useState(0);
  const [showQuip, setShowQuip] = useState(false);
  const personalEntries = entries.filter(
    (entry) => entry.playerId === currentPlayerID,
  );
  const weeklyEntries = entriesWithinDays(personalEntries, 7);
  const monthDays = activityDays(personalEntries);
  const streak = Math.max(player.currentStreak, currentStreak(personalEntries));
  const goalValue = Math.min(weeklyEntries.length, WEEKLY_GOAL);
  const streakQuip = copy.streakQuips[quipIndex].replace(
    "{value}",
    streakQuipValue(streak, quipIndex),
  );

  function revealStreakQuip() {
    setQuipIndex(Math.floor(Math.random() * copy.streakQuips.length));
    setShowQuip(true);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("saved") !== "1") {
      return;
    }
    window.history.replaceState(null, "", "/");
    const showTimer = window.setTimeout(() => setShowSavedToast(true), 0);
    const hideTimer = window.setTimeout(() => setShowSavedToast(false), 4200);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

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

      <section className="hero-card" aria-labelledby="next-workout-title">
        <div className="hero-card__content">
          <p className="eyebrow eyebrow--lime">Next workout · due today</p>
          <h1 id="next-workout-title">Hill Sprints</h1>
          <p className="hero-card__detail">
            8 reps <span>×</span> 6 seconds
          </p>
          <Link className="button button--lime" href="/log">
            Log session <span aria-hidden="true">→</span>
          </Link>
        </div>
        <WorkoutInstructions />
        <div className="hill-art" aria-hidden="true">
          <span className="hill-art__sun">✦</span>
          <span className="hill-art__runner">🏃</span>
        </div>
      </section>

      <section className="goal-card">
        <div>
          <p className="eyebrow">Weekly goal</p>
          <h2>
            {goalValue} <span>of {WEEKLY_GOAL}</span>
          </h2>
          <p>
            {goalValue >= WEEKLY_GOAL
              ? "Goal met—nice work!"
              : `${WEEKLY_GOAL - goalValue} more session to hit your goal.`}
          </p>
        </div>
        <div className="goal-card__progress">
          <strong>{Math.round((goalValue / WEEKLY_GOAL) * 100)}%</strong>
          <ProgressBar
            value={goalValue}
            max={WEEKLY_GOAL}
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
          {showQuip ? (
            <p className="streak-quip" id="streak-quip" role="status">
              {streakQuip}
            </p>
          ) : null}
        </article>
        <article>
          <span aria-hidden="true">🏆</span>
          <strong>12</strong>
          <p>Longest streak</p>
        </article>
        <article>
          <span aria-hidden="true">⚡</span>
          <strong>{player.effortPoints}</strong>
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

      <SessionList entries={personalEntries} />

      <section className="card team-preview">
        <div>
          <p className="eyebrow">Team pulse</p>
          <h2>8 teammates showed up today</h2>
          <p>Your crew is building momentum together.</p>
        </div>
        <div
          className="avatar-stack"
          aria-label="Teammates who completed today's challenge"
        >
          {players.slice(1, 6).map((teammate) => (
            <Avatar
              key={teammate.id}
              player={teammate}
              size="small"
              completed
            />
          ))}
          <span className="avatar avatar--small avatar--more">+3</span>
        </div>
        <Link className="button button--outline" href="/team">
          Team activity
        </Link>
      </section>
    </div>
  );
}
