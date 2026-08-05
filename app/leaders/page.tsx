"use client";

import { useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { copy } from "../content/copy";
import { players, TEAM_NAME } from "../data/mockData";

type Period = "Weekly" | "30 Days" | "Season";
type Metric = "Effort" | "Streaks" | "Consistency";

export default function LeadersPage() {
  const [period, setPeriod] = useState<Period>("Weekly");
  const [metric, setMetric] = useState<Metric>("Effort");
  const ranked = useMemo(
    () =>
      [...players].sort((a, b) => {
        const aValue =
          metric === "Effort"
            ? a.effortPoints
            : metric === "Streaks"
              ? a.currentStreak
              : a.consistency;
        const bValue =
          metric === "Effort"
            ? b.effortPoints
            : metric === "Streaks"
              ? b.currentStreak
              : b.consistency;
        return (
          bValue - aValue ||
          b.consistency - a.consistency ||
          a.firstName.localeCompare(b.firstName)
        );
      }),
    [metric],
  );

  function valueFor(player: (typeof players)[number]): string {
    if (metric === "Effort") return `${player.effortPoints} pts`;
    if (metric === "Streaks") return `${player.currentStreak} days`;
    return `${player.consistency} in 5`;
  }

  return (
    <div className="page page--leaders">
      <header className="page-header">
        <span
          className="page-header__icon page-header__icon--purple"
          aria-hidden="true"
        >
          ♜
        </span>
        <div>
          <p className="eyebrow">Lead with effort</p>
          <h1>Leaders</h1>
          <p>Consistency helps the whole crew grow.</p>
        </div>
      </header>
      <div className="segmented" aria-label="Leaderboard time period">
        {(["Weekly", "30 Days", "Season"] as Period[]).map((option) => (
          <button
            type="button"
            key={option}
            className={period === option ? "is-active" : ""}
            onClick={() => setPeriod(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div
        className="segmented segmented--metric"
        aria-label="Leaderboard category"
      >
        {(["Effort", "Streaks", "Consistency"] as Metric[]).map((option) => (
          <button
            type="button"
            key={option}
            className={metric === option ? "is-active" : ""}
            onClick={() => setMetric(option)}
          >
            {option === "Effort" ? "⚡" : option === "Streaks" ? "🔥" : "↻"}{" "}
            {option}
          </button>
        ))}
      </div>
      <section className="leader-summary" aria-label={`${period} team summary`}>
        <article>
          <span aria-hidden="true">⚡</span>
          <div>
            <p>Team effort</p>
            <strong>
              {players
                .reduce((sum, player) => sum + player.effortPoints, 0)
                .toLocaleString()}
            </strong>
            <small>participation points</small>
          </div>
        </article>
        <article>
          <span aria-hidden="true">✓</span>
          <div>
            <p>Showing up</p>
            <strong>
              {players.reduce((sum, player) => sum + player.weeklySessions, 0)}
            </strong>
            <small>team sessions</small>
          </div>
        </article>
      </section>
      <section className="podium" aria-label={`Top three for ${metric}`}>
        {[ranked[1], ranked[0], ranked[2]].map((player, index) => {
          const place = index === 0 ? 2 : index === 1 ? 1 : 3;
          return (
            <article
              className={`podium__place podium__place--${place}`}
              key={player.id}
            >
              <span className="podium__medal">{place}</span>
              <Avatar player={player} size="large" />
              <strong>
                {player.firstName} {player.lastInitial}
              </strong>
              <small>{TEAM_NAME}</small>
              <span className="pill">{valueFor(player)}</span>
            </article>
          );
        })}
      </section>
      <section className="card ranking-list" aria-label="Full leaderboard">
        {ranked.slice(3).map((player, index) => (
          <article key={player.id}>
            <strong className="ranking-list__rank">{index + 4}</strong>
            <Avatar player={player} size="small" />
            <div>
              <strong>
                {player.firstName} {player.lastInitial}
              </strong>
              <small>{TEAM_NAME}</small>
            </div>
            <span className="pill">{valueFor(player)}</span>
          </article>
        ))}
      </section>
      <aside className="everyone-card">
        <span aria-hidden="true">●●●</span>
        <div>
          <h2>{copy.allEffortCounts}</h2>
          <p>
            These boards celebrate showing up, steady habits, and supporting the
            team. Athletic results stay private.
          </p>
        </div>
      </aside>
    </div>
  );
}
