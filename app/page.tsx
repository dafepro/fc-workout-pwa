"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./components/Avatar";
import { ProgressBar } from "./components/ProgressBar";
import { copy } from "./content/copy";
import {
  activities,
  CURRENT_PLAYER_ID,
  players,
  WEEKLY_GOAL,
} from "./data/mockData";
import {
  activityDays,
  canDeleteEntry,
  currentStreak,
  entriesWithinDays,
  streakQuipValue,
} from "./domain/rules";
import { useTraining } from "./state/training-context";

export default function HomePage() {
  const { entries, deleteEntry } = useTraining();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [visibleSessions, setVisibleSessions] = useState(3);
  const [quipIndex, setQuipIndex] = useState(0);
  const [showQuip, setShowQuip] = useState(false);
  const player = players.find((item) => item.id === CURRENT_PLAYER_ID)!;
  const personalEntries = entries.filter(
    (entry) => entry.playerId === player.id,
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
        <details className="workout-instructions">
          <summary aria-label="How to do Hill Sprints">i</summary>
          <div>
            <h2>How to do Hill Sprints</h2>
            <ol>
              {copy.hillSprintInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </div>
        </details>
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

      <section className="card recent-card">
        <div className="section-heading">
          <h2>My Sessions</h2>
        </div>
        <div className="history-list">
          {personalEntries.slice(0, visibleSessions).map((entry) => {
            const activity = activities.find(
              (item) => item.id === entry.activityId,
            )!;
            const deletable = canDeleteEntry(entry, CURRENT_PLAYER_ID);
            return (
              <article
                className={`history-row history-row--${activity.id}`}
                key={entry.id}
              >
                <span className="history-row__icon" aria-hidden="true">
                  {activity.icon}
                </span>
                <div>
                  <strong>{activity.name}</strong>
                  <p>
                    {new Date(entry.occurredAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {entry.value} {entry.unit}
                  </p>
                </div>
                <span
                  className="effort-meter"
                  aria-label={`Effort: ${entry.effortLevel} of 7`}
                  title="How the session felt"
                >
                  {Array.from({ length: 7 }, (_, index) => (
                    <span
                      className={index < entry.effortLevel ? "is-filled" : ""}
                      key={index}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                {deletable ? (
                  <details className="session-actions">
                    <summary aria-label={`Actions for ${activity.name}`}>
                      •••
                    </summary>
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                    >
                      Delete
                    </button>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
        {visibleSessions < personalEntries.length ? (
          <button
            className="history-load-more"
            type="button"
            aria-label="Load more sessions"
            onClick={() => setVisibleSessions((count) => count + 3)}
          >
            <span aria-hidden="true">⌄</span>
          </button>
        ) : null}
      </section>

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
