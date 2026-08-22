"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { ProgressBar } from "../../components/ProgressBar";
import { ReactionPicker } from "../../components/ReactionPicker";
import { TeamChallengeCard } from "../../components/TeamChallengeCard";
import { copy } from "../../content/copy";
import { createSocialGateway } from "../../data/social-gateway";
import type {
  Player,
  ReactionContext,
  ReactionType,
  TeamActivityProjection,
  TeamGoalStatus,
  TeamMemberProjection,
} from "../../domain/types";
import { entriesWithinDays } from "../../domain/rules";
import { useTraining } from "../../state/training-context";
import { useAuth } from "../../state/auth-context";

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
  const [cheerSelection, setCheerSelection] = useState<{
    player: Player;
    context: ReactionContext;
    contextLabel: string;
  } | null>(null);
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
    const challenge = projection.currentChallenge;
    const challengeCompleted = challenge
      ? entries.some(
          (entry) =>
            entry.playerId === currentPlayerID &&
            entry.assignmentId === challenge.id &&
            entry.unit === challenge.targetUnit &&
            entry.value >= challenge.targetValue,
        )
      : false;
    const wasChallengeCompleted = projection.members.some(
      (member) => member.id === currentPlayerID && member.challengeCompleted,
    );
    const members = projection.members.map((member) =>
      member.id === currentPlayerID
        ? {
            ...member,
            weeklySessions,
            goalStatus: statusForGoal(
              weeklySessions,
              projection.team.weeklyGoal,
            ),
            challengeCompleted,
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
      currentChallenge: challenge
        ? {
            ...challenge,
            completedCount:
              challenge.completedCount +
              Number(challengeCompleted) -
              Number(wasChallengeCompleted),
          }
        : null,
      members,
    };
  }, [connected, currentPlayerID, entries, projection]);

  async function react(type: ReactionType, emoji: string) {
    if (!cheerSelection) return;
    const { player, context } = cheerSelection;
    setSentLabel("");
    await sendReaction(player.id, type, context);
    setSentLabel(copy.cheers.sent(emoji, player.firstName));
    setCheerSelection(null);
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
          <TeamChallengeCard
            challenge={displayedProjection.currentChallenge}
            members={displayedProjection.members}
            currentPlayerID={currentPlayerID}
            onCheer={(player) =>
              setCheerSelection({
                player,
                context: {
                  type: "challenge",
                  teamId: teamID,
                  assignmentId: displayedProjection.currentChallenge!.id,
                },
                contextLabel: `${displayedProjection.currentChallenge!.activityName} challenge`,
              })
            }
          />

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
                      onCheer={() =>
                        setCheerSelection({
                          player,
                          context: {
                            type: "team_progress",
                            teamId: teamID,
                            period: "weekly",
                          },
                          contextLabel: copy.cheers.contextLabels.team_progress,
                        })
                      }
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
        recipient={cheerSelection?.player ?? null}
        contextLabel={cheerSelection?.contextLabel ?? ""}
        onClose={() => setCheerSelection(null)}
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
      <PlayerAvatar player={player} size="small" />
      <span className="player-progress__body">
        <span className="player-progress__meta">
          <strong>
            {player.firstName} {player.lastInitial}
          </strong>
          <small>
            {Math.min(player.weeklySessions, weeklyGoal)} of {weeklyGoal}
          </small>
        </span>
        <ProgressBar
          value={player.weeklySessions}
          max={weeklyGoal}
          tone={tone}
          label={`${player.firstName}'s weekly participation`}
        />
      </span>
      {!isCurrentPlayer ? (
        <span className="player-progress__cheer">{copy.social.cheer}</span>
      ) : null}
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
