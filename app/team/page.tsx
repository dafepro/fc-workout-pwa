"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ProgressBar } from "../components/ProgressBar";
import { ReactionPicker } from "../components/ReactionPicker";
import { copy } from "../content/copy";
import { createSocialGateway } from "../data/social-gateway";
import type {
  Player,
  ReactionType,
  TeamActivityProjection,
  TeamGoalStatus,
  TeamMemberProjection,
} from "../domain/types";
import { entriesWithinDays } from "../domain/rules";
import { useTraining } from "../state/training-context";
import { useAuth } from "../state/auth-context";

export default function TeamPage() {
  const { entries, sendReaction } = useTraining();
  const { connected, currentPlayerID, session } = useAuth();
  const teamID = session?.player?.teams[0]?.id ?? "team-hill-striders";
  const gateway = useMemo(
    () => createSocialGateway(connected, teamID),
    [connected, teamID],
  );
  const [projection, setProjection] = useState<TeamActivityProjection | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sentLabel, setSentLabel] = useState("");

  const loadTeam = useCallback(async () => {
    setStatus("loading");
    try {
      setProjection(await gateway.teamActivity());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    void gateway.teamActivity().then(
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
  }, [gateway]);

  const displayedProjection = useMemo(() => {
    if (!projection || connected) return projection;
    const weeklySessions = entriesWithinDays(
      entries.filter((entry) => entry.playerId === currentPlayerID),
      7,
    ).length;
    const members = projection.members.map((member) =>
      member.id === currentPlayerID
        ? {
            ...member,
            weeklySessions,
            goalStatus: statusForGoal(
              weeklySessions,
              projection.team.weeklyGoal,
            ),
          }
        : member,
    );
    return {
      ...projection,
      teamSessions: members.reduce(
        (total, member) => total + member.weeklySessions,
        0,
      ),
      membersMeetingGoal: members.filter(
        (member) => member.weeklySessions >= projection.team.weeklyGoal,
      ).length,
      members,
    };
  }, [connected, currentPlayerID, entries, projection]);

  async function react(type: ReactionType, emoji: string) {
    if (!selectedPlayer) return;
    const teammate = selectedPlayer;
    const result = await sendReaction(teammate.id, type, {
      type: "team_progress",
      teamId: teamID,
      period: "weekly",
    });
    setSentLabel(
      `${emoji} sent to ${teammate.firstName}! ${result.remainingForRecipientToday} left today.`,
    );
    setSelectedPlayer(null);
  }

  const groups = displayedProjection
    ? [
        teamGroup(
          "completed",
          "Completed",
          "Goal met!",
          "lime",
          displayedProjection,
        ),
        teamGroup(
          "one_away",
          "One Away",
          "Almost there!",
          "gold",
          displayedProjection,
        ),
        teamGroup(
          "keep_going",
          "Keep Going",
          "You’ve got this!",
          "blue",
          displayedProjection,
        ),
      ]
    : [];

  return (
    <div className="page page--team">
      <header className="page-title-header">
        <h1>Team</h1>
        <p>
          {displayedProjection?.team.name ??
            session?.player?.teams[0]?.name ??
            ""}
        </p>
      </header>

      {status === "loading" && !projection ? (
        <section className="card notice" role="status">
          {copy.social.teamLoading}
        </section>
      ) : null}
      {status === "error" ? (
        <section className="notice notice--error" role="alert">
          <strong>{copy.social.teamError}</strong>
          <button type="button" onClick={() => void loadTeam()}>
            {copy.social.retry}
          </button>
        </section>
      ) : null}

      {displayedProjection ? (
        <>
          <section className="challenge-card">
            <div>
              <p className="eyebrow eyebrow--lime">{copy.social.weeklyGoal}</p>
              <h2>{displayedProjection.team.weeklyGoal} sessions</h2>
              <p className="challenge-card__due">{copy.social.dueSunday}</p>
              <strong className="challenge-card__count">
                <span>✓</span> {displayedProjection.membersMeetingGoal} of{" "}
                {displayedProjection.members.length} teammates met the goal
              </strong>
            </div>
            <div className="challenge-card__art" aria-hidden="true">
              🏃
            </div>
            <div
              className="challenge-card__avatars"
              aria-label="Weekly goal participation"
            >
              {displayedProjection.members.slice(0, 9).map((player) => (
                <Avatar
                  key={player.id}
                  player={player}
                  size="small"
                  completed={player.goalStatus === "completed"}
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
                {copy.social.consistencyBadge}
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
                      weeklyGoal={displayedProjection.team.weeklyGoal}
                      tone={group.tone}
                      onCheer={() => setSelectedPlayer(player)}
                      isCurrentPlayer={player.id === currentPlayerID}
                    />
                  ))}
                </section>
              ))}
            </div>
          </section>
        </>
      ) : null}
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

function statusForGoal(sessions: number, weeklyGoal: number): TeamGoalStatus {
  if (sessions >= weeklyGoal) return "completed";
  if (sessions === weeklyGoal - 1) return "one_away";
  return "keep_going";
}

function teamGroup(
  status: TeamGoalStatus,
  title: string,
  subtitle: string,
  tone: "lime" | "gold" | "blue",
  projection: TeamActivityProjection,
) {
  return {
    title,
    subtitle,
    tone,
    players: projection.members.filter(
      (player) => player.goalStatus === status,
    ),
  };
}

function PlayerProgressRow({
  player,
  weeklyGoal,
  tone,
  onCheer,
  isCurrentPlayer,
}: {
  player: TeamMemberProjection;
  weeklyGoal: number;
  tone: "lime" | "gold" | "blue";
  onCheer: () => void;
  isCurrentPlayer: boolean;
}) {
  const content = (
    <>
      <Avatar player={player} size="small" />
      <strong>
        {player.firstName} {player.lastInitial}
      </strong>
      <ProgressBar
        value={player.weeklySessions}
        max={weeklyGoal}
        tone={tone}
        label={`${player.firstName}'s weekly participation`}
      />
      <span>
        {Math.min(player.weeklySessions, weeklyGoal)} of {weeklyGoal}
      </span>
    </>
  );
  if (isCurrentPlayer) {
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
