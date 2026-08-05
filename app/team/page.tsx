"use client";

import { useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ProgressBar } from "../components/ProgressBar";
import { ReactionPicker } from "../components/ReactionPicker";
import {
  CURRENT_PLAYER_ID,
  players,
  TEAM_NAME,
  WEEKLY_GOAL,
} from "../data/mockData";
import { entriesWithinDays } from "../domain/rules";
import type { Player, ReactionType } from "../domain/types";
import { useTraining } from "../state/training-context";

export default function TeamPage() {
  const { entries, sendReaction } = useTraining();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sentLabel, setSentLabel] = useState("");
  const myWeek = entriesWithinDays(
    entries.filter((entry) => entry.playerId === CURRENT_PLAYER_ID),
    7,
  ).length;
  const myToday =
    entriesWithinDays(
      entries.filter((entry) => entry.playerId === CURRENT_PLAYER_ID),
      1,
    ).length > 0;

  const progressPlayers = useMemo(
    () =>
      players.map((player) =>
        player.id === CURRENT_PLAYER_ID
          ? { ...player, weeklySessions: myWeek }
          : player,
      ),
    [myWeek],
  );
  const groups = [
    {
      title: "Completed",
      subtitle: "Goal met!",
      tone: "lime" as const,
      players: progressPlayers.filter(
        (player) => player.weeklySessions >= WEEKLY_GOAL,
      ),
    },
    {
      title: "One Away",
      subtitle: "Almost there!",
      tone: "gold" as const,
      players: progressPlayers.filter(
        (player) => player.weeklySessions === WEEKLY_GOAL - 1,
      ),
    },
    {
      title: "Keep Going",
      subtitle: "You’ve got this!",
      tone: "blue" as const,
      players: progressPlayers.filter(
        (player) => player.weeklySessions < WEEKLY_GOAL - 1,
      ),
    },
  ];
  const challengePlayers = players.slice(0, 9);
  const completedCount = 7 + (myToday ? 1 : 0);

  async function react(type: ReactionType, emoji: string) {
    if (!selectedPlayer) return;
    const teammate = selectedPlayer;
    const result = await sendReaction(teammate.id, type, {
      type: "team_progress",
      teamId: "team-hill-striders",
      period: "weekly",
    });
    setSentLabel(
      `${emoji} sent to ${teammate.firstName}! ${result.remainingForRecipientToday} left today.`,
    );
    setSelectedPlayer(null);
  }

  return (
    <div className="page page--team">
      <header className="page-title-header">
        <h1>Team</h1>
        <p>{TEAM_NAME}</p>
      </header>

      <section className="challenge-card">
        <div>
          <p className="eyebrow eyebrow--lime">Today’s challenge</p>
          <h2>Hill Sprints</h2>
          <p className="challenge-card__due">◷ Due by 11:59 PM</p>
          <strong className="challenge-card__count">
            <span>✓</span> {completedCount} of {players.length} teammates
            completed
          </strong>
        </div>
        <div className="challenge-card__art" aria-hidden="true">
          🏃
        </div>
        <div
          className="challenge-card__avatars"
          aria-label="Challenge participation"
        >
          {challengePlayers.map((player, index) => (
            <Avatar
              key={player.id}
              player={player}
              size="small"
              completed={index < completedCount}
            />
          ))}
        </div>
      </section>

      <section className="card team-progress-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Team progress</p>
            <h2>Weekly goal</h2>
          </div>
          <span className="badge-callout">
            ✦ 3 logs in 5 days = Consistency badge
          </span>
        </div>
        <div className="progress-groups">
          {groups.map((group) => (
            <section
              className={`progress-group progress-group--${group.tone}`}
              key={group.title}
            >
              <header>
                <strong>{group.title}</strong>
                <span>{group.subtitle}</span>
              </header>
              {group.players.map((player) => (
                <PlayerProgressRow
                  key={player.id}
                  player={player}
                  tone={group.tone}
                  onCheer={() => setSelectedPlayer(player)}
                />
              ))}
            </section>
          ))}
        </div>
      </section>
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

function PlayerProgressRow({
  player,
  tone,
  onCheer,
}: {
  player: Player;
  tone: "lime" | "gold" | "blue";
  onCheer: () => void;
}) {
  const content = (
    <>
      <Avatar player={player} size="small" />
      <strong>
        {player.firstName} {player.lastInitial}
      </strong>
      <ProgressBar
        value={player.weeklySessions}
        max={WEEKLY_GOAL}
        tone={tone}
        label={`${player.firstName}'s weekly participation`}
      />
      <span>
        {Math.min(player.weeklySessions, WEEKLY_GOAL)} of {WEEKLY_GOAL}
      </span>
    </>
  );
  if (player.id === CURRENT_PLAYER_ID) {
    return <div className="player-progress">{content}</div>;
  }
  return (
    <button
      type="button"
      className="player-progress player-progress--reactable"
      aria-label={`Cheer for ${player.firstName} ${player.lastInitial}`}
      onClick={onCheer}
    >
      {content}
    </button>
  );
}
