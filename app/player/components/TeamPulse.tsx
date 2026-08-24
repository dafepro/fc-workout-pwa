"use client";

import { useState } from "react";
import { Avatar } from "../../components/Avatar";
import type {
  Player,
  ReactionContext,
  ReactionType,
  SendReactionResult,
  TeamPulseActivity,
} from "../../domain/types";
import { playerExperienceCopy } from "../content";

interface TeamPulseProps {
  activeThisWeek: number;
  activities: TeamPulseActivity[];
  teamId: string;
  unlocked: boolean;
  onSendReaction(
    playerId: string,
    type: ReactionType,
    context: ReactionContext,
  ): Promise<SendReactionResult>;
}

export function TeamPulse({
  activeThisWeek,
  activities,
  teamId,
  unlocked,
  onSendReaction,
}: TeamPulseProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const copy = playerExperienceCopy.teamPulse;
  const recentActivities = activities.slice(0, 5);
  const visibleActivities = recentActivities.slice(0, expanded ? 5 : 3);

  async function cheer(item: TeamPulseActivity, key: string) {
    setPending(key);
    setError("");
    try {
      await onSendReaction(item.playerId, "clap", {
        type: "team_progress",
        teamId,
        period: "weekly",
      });
      setSent((current) => new Set(current).add(key));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="team-pulse" aria-labelledby="team-pulse-title">
      <header className="team-pulse__heading">
        <div>
          <p className="player-eyebrow">{copy.eyebrow}</p>
          <h2 id="team-pulse-title">{copy.title}</h2>
        </div>
        {unlocked ? <span>{copy.activeThisWeek(activeThisWeek)}</span> : null}
      </header>

      {!unlocked ? (
        <div className="team-pulse__locked">
          <span aria-hidden="true">◆</span>
          <div>
            <strong>{copy.locked}</strong>
            <p>{copy.lockedDetail}</p>
          </div>
        </div>
      ) : visibleActivities.length === 0 ? (
        <p className="team-pulse__empty">{copy.empty}</p>
      ) : (
        <ul id="team-pulse-list" aria-label={copy.listLabel}>
          {visibleActivities.map((activity, index) => {
            const key = `${activity.playerId}-${activity.activityName}-${index}`;
            const wasSent = sent.has(key);
            const isPending = pending === key;
            return (
              <li key={key}>
                <Avatar player={pulsePlayer(activity)} size="small" />
                <div className="team-pulse__activity">
                  <strong>
                    {activity.firstName}{" "}
                    {normalizedInitial(activity.lastInitial)}
                  </strong>
                  <span>
                    {activity.activityName} · {activity.recency}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={pending !== null || wasSent}
                  aria-label={
                    wasSent
                      ? `Cheered for ${activity.firstName}`
                      : `Cheer ${activity.firstName} for ${activity.activityName}`
                  }
                  onClick={() => void cheer(activity, key)}
                >
                  <span aria-hidden="true">👏</span>
                  {wasSent
                    ? copy.cheered
                    : isPending
                      ? copy.cheering
                      : copy.cheer}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {unlocked && recentActivities.length > 3 ? (
        <button
          type="button"
          className={`team-pulse__expand${expanded ? " is-expanded" : ""}`}
          aria-controls="team-pulse-list"
          aria-expanded={expanded}
          aria-label={expanded ? copy.showLessLabel : copy.showMoreLabel}
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? copy.showLess : copy.showMore}</span>
          <span className="team-pulse__chevron" aria-hidden="true" />
        </button>
      ) : null}

      {unlocked ? (
        <small className="team-pulse__private">{copy.privateDetail}</small>
      ) : null}
      {error ? (
        <p className="team-pulse__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function normalizedInitial(value: string): string {
  return `${value.replace(/\.$/, "")}.`;
}

function pulsePlayer(activity: TeamPulseActivity): Player {
  const lastInitial = normalizedInitial(activity.lastInitial);
  return {
    id: activity.playerId,
    firstName: activity.firstName,
    lastInitial,
    initials: `${activity.firstName[0] ?? ""}${lastInitial[0] ?? ""}`,
    avatarColor: "",
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
}
