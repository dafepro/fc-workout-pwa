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
  TEAM_NAME,
  WEEKLY_GOAL,
} from "./data/mockData";
import {
  canDeleteEntry,
  currentStreak,
  entriesWithinDays,
} from "./domain/rules";
import { useTraining } from "./state/training-context";

export default function HomePage() {
  const { entries, deleteEntry } = useTraining();
  const [showSavedToast, setShowSavedToast] = useState(false);
  const player = players.find((item) => item.id === CURRENT_PLAYER_ID)!;
  const personalEntries = entries.filter(
    (entry) => entry.playerId === player.id,
  );
  const weeklyEntries = entriesWithinDays(personalEntries, 7);
  const monthEntries = entriesWithinDays(personalEntries, 30);
  const streak = Math.max(player.currentStreak, currentStreak(personalEntries));
  const goalValue = Math.min(weeklyEntries.length, WEEKLY_GOAL);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("saved") !== "1") {
      return;
    }
    window.history.replaceState(null, "", "/");
    const showTimer = window.setTimeout(() => setShowSavedToast(true), 0);
    const hideTimer = window.setTimeout(() => setShowSavedToast(false), 2400);
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
      <header className="player-header">
        <Avatar player={player} size="large" />
        <div>
          <p className="eyebrow">Ready to move?</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{TEAM_NAME}</p>
        </div>
        <span className="level-pill">Level 12</span>
      </header>

      <section className="hero-card" aria-labelledby="next-workout-title">
        <div>
          <p className="eyebrow eyebrow--lime">Next workout · due today</p>
          <h2 id="next-workout-title">Hill Sprints</h2>
          <p className="hero-card__detail">
            8 reps <span>×</span> 6 seconds
          </p>
          <p className="hero-card__support">
            Fast feet. Full recovery. Strong finish.
          </p>
          <Link className="button button--lime" href="/log">
            Log session <span aria-hidden="true">→</span>
          </Link>
        </div>
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
        <article>
          <span aria-hidden="true">🔥</span>
          <strong>{streak}</strong>
          <p>Current streak</p>
        </article>
        <article>
          <span aria-hidden="true">🏆</span>
          <strong>12</strong>
          <p>Longest streak</p>
        </article>
        <article>
          <span aria-hidden="true">▦</span>
          <strong>{monthEntries.length}</strong>
          <p>30-day sessions</p>
        </article>
        <article>
          <span aria-hidden="true">⚡</span>
          <strong>{player.effortPoints}</strong>
          <p>Effort points</p>
        </article>
      </section>

      <section className="card recent-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Private history</p>
            <h2>Recent sessions</h2>
          </div>
          <Link href="/me">View all</Link>
        </div>
        <div className="history-list">
          {personalEntries.slice(0, 3).map((entry) => {
            const activity = activities.find(
              (item) => item.id === entry.activityId,
            )!;
            const deletable = canDeleteEntry(entry, CURRENT_PLAYER_ID);
            return (
              <article className="history-row" key={entry.id}>
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
                <span className="pill">Effort {entry.effortLevel}/7</span>
                {deletable ? (
                  <button
                    className="text-button text-button--danger"
                    type="button"
                    onClick={() => deleteEntry(entry.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
        <p className="privacy-note">
          <span aria-hidden="true">◆</span> Times, distances, and reps stay
          private to you and your coaches.
        </p>
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
