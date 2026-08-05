"use client";

import { useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ReactionPicker } from "../components/ReactionPicker";
import { copy } from "../content/copy";
import { CURRENT_PLAYER_ID, players, TEAM_NAME } from "../data/mockData";
import type { Player, ReactionType } from "../domain/types";
import { useTraining } from "../state/training-context";

type Period = "Weekly" | "30 Days" | "Season";
type Metric = "Effort" | "Streaks" | "Consistency";

export default function LeadersPage() {
  const { sendReaction } = useTraining();
  const [period, setPeriod] = useState<Period>("Weekly");
  const [metric, setMetric] = useState<Metric>("Effort");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sentLabel, setSentLabel] = useState("");
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

  async function react(type: ReactionType, emoji: string) {
    if (!selectedPlayer) return;
    const teammate = selectedPlayer;
    const result = await sendReaction(teammate.id, type, {
      type: "leaderboard",
      teamId: "team-hill-striders",
      period:
        period === "Weekly"
          ? "weekly"
          : period === "30 Days"
            ? "thirty_days"
            : "season",
      metric: metric.toLowerCase() as "effort" | "streaks" | "consistency",
    });
    setSentLabel(
      `${emoji} sent to ${teammate.firstName}! ${result.remainingForRecipientToday} left today.`,
    );
    setSelectedPlayer(null);
  }

  return (
    <div className="page page--leaders">
      <header className="page-title-header">
        <h1>Leaderboard</h1>
      </header>

      <section className="leader-summary" aria-label="Team summary">
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

      <section
        className="card leaderboard-panel"
        aria-label={`${period} ${metric} leaderboard`}
      >
        <div className="leaderboard-controls">
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
            {(["Effort", "Streaks", "Consistency"] as Metric[]).map(
              (option) => (
                <button
                  type="button"
                  key={option}
                  className={metric === option ? "is-active" : ""}
                  onClick={() => setMetric(option)}
                >
                  {option === "Effort"
                    ? "⚡"
                    : option === "Streaks"
                      ? "🔥"
                      : "↻"}{" "}
                  {option}
                </button>
              ),
            )}
          </div>
        </div>

        <section className="podium" aria-label={`Top three for ${metric}`}>
          {[ranked[1], ranked[0], ranked[2]].map((player, index) => {
            const place = index === 0 ? 2 : index === 1 ? 1 : 3;
            return (
              <PodiumPlayer
                key={player.id}
                player={player}
                place={place}
                value={valueFor(player)}
                onCheer={() => setSelectedPlayer(player)}
              />
            );
          })}
        </section>
        <section className="ranking-list" aria-label="Full leaderboard">
          {ranked.slice(3).map((player, index) => (
            <RankingPlayer
              key={player.id}
              player={player}
              rank={index + 4}
              value={valueFor(player)}
              onCheer={() => setSelectedPlayer(player)}
            />
          ))}
        </section>
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
      {sentLabel ? (
        <p className="reaction-sent-status pill pill--lime" role="status">
          {sentLabel}
        </p>
      ) : null}
      <ReactionPicker
        recipient={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        onSend={react}
      />
    </div>
  );
}

function PodiumPlayer({
  player,
  place,
  value,
  onCheer,
}: {
  player: Player;
  place: number;
  value: string;
  onCheer: () => void;
}) {
  const content = (
    <>
      <span className="podium__medal">{place}</span>
      <Avatar player={player} size="large" />
      <strong>
        {player.firstName} {player.lastInitial}
      </strong>
      <small>{TEAM_NAME}</small>
      <span className="pill">{value}</span>
    </>
  );
  const className = `podium__place podium__place--${place}`;
  if (player.id === CURRENT_PLAYER_ID) {
    return <article className={className}>{content}</article>;
  }
  return (
    <button
      type="button"
      className={`${className} podium__place--reactable`}
      aria-label={`Cheer for ${player.firstName} ${player.lastInitial}`}
      onClick={onCheer}
    >
      {content}
    </button>
  );
}

function RankingPlayer({
  player,
  rank,
  value,
  onCheer,
}: {
  player: Player;
  rank: number;
  value: string;
  onCheer: () => void;
}) {
  const content = (
    <>
      <strong className="ranking-list__rank">{rank}</strong>
      <Avatar player={player} size="small" />
      <div>
        <strong>
          {player.firstName} {player.lastInitial}
        </strong>
        <small>{TEAM_NAME}</small>
      </div>
      <span className="pill">{value}</span>
    </>
  );
  if (player.id === CURRENT_PLAYER_ID) {
    return <article className="ranking-row">{content}</article>;
  }
  return (
    <button
      type="button"
      className="ranking-row ranking-row--reactable"
      aria-label={`Cheer for ${player.firstName} ${player.lastInitial}`}
      onClick={onCheer}
    >
      {content}
    </button>
  );
}
