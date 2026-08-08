"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ReactionPicker } from "../components/ReactionPicker";
import { copy } from "../content/copy";
import { createSocialGateway } from "../data/social-gateway";
import type {
  LeaderboardItem,
  LeaderboardProjection,
  Player,
  ReactionMetric,
  ReactionPeriod,
  ReactionType,
} from "../domain/types";
import { useTraining } from "../state/training-context";
import { useAuth } from "../state/auth-context";

type Period = "Weekly" | "30 Days" | "Season";
type Metric = "Effort" | "Streaks" | "Consistency";

export default function LeadersPage() {
  const { sendReaction } = useTraining();
  const { connected, currentPlayerID, session } = useAuth();
  const teamID = session?.player?.teams[0]?.id ?? "team-hill-striders";
  const gateway = useMemo(
    () => createSocialGateway(connected, teamID),
    [connected, teamID],
  );
  const [period, setPeriod] = useState<Period>("Weekly");
  const [metric, setMetric] = useState<Metric>("Effort");
  const [projection, setProjection] = useState<LeaderboardProjection | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sentLabel, setSentLabel] = useState("");

  const apiPeriod = periodValue(period);
  const apiMetric = metricValue(metric);
  const loadLeaderboard = useCallback(async () => {
    setStatus("loading");
    try {
      setProjection(await gateway.leaderboard(apiPeriod, apiMetric));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [apiMetric, apiPeriod, gateway]);

  useEffect(() => {
    let active = true;
    void gateway.leaderboard(apiPeriod, apiMetric).then(
      (result) => {
        if (!active) return;
        setProjection(result);
        setStatus("ready");
      },
      () => active && setStatus("error"),
    );
    return () => {
      active = false;
    };
  }, [apiMetric, apiPeriod, gateway]);

  function valueFor(player: LeaderboardItem): string {
    if (metric === "Effort") return `${player.value} pts`;
    if (metric === "Streaks") return `${player.value} days`;
    return `${player.value} active days`;
  }

  async function react(type: ReactionType, emoji: string) {
    if (!selectedPlayer) return;
    const teammate = selectedPlayer;
    setSentLabel("");
    await sendReaction(teammate.id, type, {
      type: "leaderboard",
      teamId: teamID,
      period: apiPeriod,
      metric: apiMetric,
    });
    setSentLabel(copy.cheers.sent(emoji, teammate.firstName));
    setSelectedPlayer(null);
  }

  const ranked = projection?.items ?? [];
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(
    (player): player is LeaderboardItem => Boolean(player),
  );

  return (
    <div className="page page--leaders">
      <header className="page-title-header">
        <h1>Leaderboard</h1>
      </header>

      {status === "loading" && !projection ? (
        <section className="card notice" role="status">
          {copy.social.leaderboardLoading}
        </section>
      ) : null}
      {status === "error" ? (
        <section className="notice notice--error" role="alert">
          <strong>{copy.social.leaderboardError}</strong>
          <button type="button" onClick={() => void loadLeaderboard()}>
            {copy.social.retry}
          </button>
        </section>
      ) : null}

      {projection ? (
        <>
          <section className="leader-summary" aria-label="Team summary">
            <article>
              <span aria-hidden="true">⚡</span>
              <div>
                <p>Team effort</p>
                <strong>{projection.teamEffortPoints.toLocaleString()}</strong>
                <small>{copy.social.safePoints}</small>
              </div>
            </article>
            <article>
              <span aria-hidden="true">✓</span>
              <div>
                <p>Showing up</p>
                <strong>{projection.teamSessions}</strong>
                <small>team sessions</small>
              </div>
            </article>
          </section>

          <section
            className="card leaderboard-panel"
            aria-label={`${period} ${metric} leaderboard`}
            aria-busy={status === "loading"}
          >
            <div className="leaderboard-controls">
              <div className="segmented" aria-label="Leaderboard time period">
                {(["Weekly", "30 Days", "Season"] as Period[]).map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={period === option ? "is-active" : ""}
                    onClick={() => {
                      setStatus("loading");
                      setPeriod(option);
                    }}
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
                      onClick={() => {
                        setStatus("loading");
                        setMetric(option);
                      }}
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

            {ranked.length === 0 ? (
              <p className="notice">{copy.social.noParticipation}</p>
            ) : (
              <>
                <section
                  className="podium"
                  aria-label={`Top three for ${metric}`}
                >
                  {podiumOrder.map((player) => (
                    <PodiumPlayer
                      key={player.id}
                      player={player}
                      place={player.rank}
                      teamName={projection.team.name}
                      value={valueFor(player)}
                      onCheer={() => setSelectedPlayer(player)}
                      isCurrentPlayer={player.id === currentPlayerID}
                    />
                  ))}
                </section>
                <section className="ranking-list" aria-label="Full leaderboard">
                  {ranked.slice(3).map((player) => (
                    <RankingPlayer
                      key={player.id}
                      player={player}
                      teamName={projection.team.name}
                      value={valueFor(player)}
                      onCheer={() => setSelectedPlayer(player)}
                      isCurrentPlayer={player.id === currentPlayerID}
                    />
                  ))}
                </section>
              </>
            )}
          </section>
        </>
      ) : null}

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
        contextLabel={`${period} ${metric} leaderboard`}
        onClose={() => setSelectedPlayer(null)}
        onSend={react}
      />
    </div>
  );
}

function periodValue(period: Period): ReactionPeriod {
  return period === "Weekly"
    ? "weekly"
    : period === "30 Days"
      ? "thirty_days"
      : "season";
}

function metricValue(metric: Metric): ReactionMetric {
  return metric.toLowerCase() as ReactionMetric;
}

function PodiumPlayer({
  player,
  place,
  teamName,
  value,
  onCheer,
  isCurrentPlayer,
}: {
  player: LeaderboardItem;
  place: number;
  teamName: string;
  value: string;
  onCheer: () => void;
  isCurrentPlayer: boolean;
}) {
  const content = (
    <>
      <span className="podium__medal">{place}</span>
      <Avatar player={player} size="large" />
      <strong>
        {player.firstName} {player.lastInitial}
      </strong>
      <small>{teamName}</small>
      <span className="pill">{value}</span>
    </>
  );
  const className = `podium__place podium__place--${place}`;
  if (isCurrentPlayer) {
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
  teamName,
  value,
  onCheer,
  isCurrentPlayer,
}: {
  player: LeaderboardItem;
  teamName: string;
  value: string;
  onCheer: () => void;
  isCurrentPlayer: boolean;
}) {
  const content = (
    <>
      <strong className="ranking-list__rank">{player.rank}</strong>
      <Avatar player={player} size="small" />
      <div>
        <strong>
          {player.firstName} {player.lastInitial}
        </strong>
        <small>{teamName}</small>
      </div>
      <span className="pill">{value}</span>
    </>
  );
  if (isCurrentPlayer) {
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
