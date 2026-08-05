"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ProgressBar } from "../components/ProgressBar";
import {
  CURRENT_PLAYER_ID,
  players,
  TEAM_NAME,
  WEEKLY_GOAL,
} from "../data/mockData";
import { entriesWithinDays } from "../domain/rules";
import type { ReactionType } from "../domain/types";
import { useTraining } from "../state/training-context";

const reactionOptions: Array<{
  type: ReactionType;
  icon: string;
  label: string;
}> = [
  { type: "clap", icon: "👏", label: "Clap" },
  { type: "fire", icon: "🔥", label: "Fire" },
  { type: "strong", icon: "💪", label: "Strong" },
  { type: "hustle", icon: "⚡", label: "Hustle" },
  { type: "runner", icon: "🏃", label: "Runner" },
  { type: "wind", icon: "💨", label: "Wind" },
  { type: "robot-leg", icon: "🦿", label: "Robot leg" },
  { type: "do-it", icon: "✓", label: "Do it" },
];

export default function TeamPage() {
  const { entries, sendReaction } = useTraining();
  const [selectedPlayer, setSelectedPlayer] = useState(players[1].id);
  const [cooldown, setCooldown] = useState(false);
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

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(false), 6000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

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

  function react(type: ReactionType, label: string) {
    if (cooldown) return;
    sendReaction(selectedPlayer, type);
    const teammate = players.find((player) => player.id === selectedPlayer)!;
    setSentLabel(`${label} sent to ${teammate.firstName}!`);
    setCooldown(true);
  }

  return (
    <div className="page page--team">
      <header className="page-header page-header--simple">
        <div>
          <p className="eyebrow">{TEAM_NAME}</p>
          <h1>Team activity</h1>
          <p>A board for showing up and cheering each other on.</p>
        </div>
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
                <div className="player-progress" key={player.id}>
                  <Avatar player={player} size="small" />
                  <strong>
                    {player.firstName} {player.lastInitial}
                  </strong>
                  <ProgressBar
                    value={player.weeklySessions}
                    max={WEEKLY_GOAL}
                    tone={group.tone}
                    label={`${player.firstName}'s weekly participation`}
                  />
                  <span>
                    {Math.min(player.weeklySessions, WEEKLY_GOAL)} of{" "}
                    {WEEKLY_GOAL}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="card reaction-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Send some energy</p>
            <h2>Cheer for a teammate</h2>
          </div>
          {sentLabel ? (
            <span className="pill pill--lime" role="status">
              {sentLabel}
            </span>
          ) : null}
        </div>
        <div
          className="teammate-picker"
          role="group"
          aria-label="Choose a teammate"
        >
          {players.slice(1, 7).map((player) => (
            <button
              type="button"
              key={player.id}
              className={selectedPlayer === player.id ? "is-selected" : ""}
              onClick={() => setSelectedPlayer(player.id)}
            >
              <Avatar player={player} size="small" />
              <span>{player.firstName}</span>
            </button>
          ))}
        </div>
        <div className="reaction-grid">
          {reactionOptions.map((reaction) => (
            <button
              type="button"
              key={reaction.type}
              disabled={cooldown}
              onClick={() => react(reaction.type, reaction.label)}
            >
              <span aria-hidden="true">{reaction.icon}</span>
              <small>{reaction.label}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
