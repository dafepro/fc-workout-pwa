"use client";

import Link from "next/link";

import { consoleCopy } from "../copy";
import { ConsoleNotice } from "../ConsoleChrome";
import { useResource } from "../useResource";
import type { TeamProgress as TeamProgressData } from "../types";

/**
 * REQ-516. How the team is tracking against its weekly goal, and how each
 * player is going, from the same projection the players' own Team screen reads.
 * Nothing here is calculated a second time, so a coach and a player can never
 * be told different things about who met the goal.
 */
export function TeamProgress({
  teamId,
  playerHref,
}: {
  teamId: string;
  playerHref: (playerId: string) => string;
}) {
  const progress = useResource<TeamProgressData>(
    `v1/staff/teams/${teamId}/progress`,
  );
  const data = progress.data;

  return (
    <>
      {progress.error ? <ConsoleNotice message={progress.error} /> : null}

      <section className="console-card" aria-label={consoleCopy.progress.title}>
        <h2 className="console-card__title">{consoleCopy.progress.title}</h2>
        {progress.loading ? <p>{consoleCopy.loading}</p> : null}
        {data ? (
          <>
            <p className="console-hint">
              {consoleCopy.progress.week(data.weekStart, data.weekEnd)}
            </p>
            <p className="console-state">
              {consoleCopy.progress.meetingGoal(
                data.membersMeetingGoal,
                data.members.length,
                data.team.weeklyGoal,
              )}
            </p>
            <p>{consoleCopy.progress.teamSessions(data.teamSessions)}</p>
            {data.currentChallenge ? (
              <p>
                {consoleCopy.progress.challenge(
                  data.currentChallenge.activityName,
                  data.currentChallenge.completedCount,
                )}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section
        className="console-card"
        aria-label={consoleCopy.progress.membersTitle}
      >
        <h2 className="console-card__title">
          {consoleCopy.progress.membersTitle}
        </h2>
        <p className="console-hint">{consoleCopy.progress.privacy}</p>
        {data && data.members.length === 0 ? (
          <p>{consoleCopy.progress.empty}</p>
        ) : null}
        <ul className="console-list">
          {(data?.members ?? []).map((member) => (
            <li key={member.playerId} className="console-list__row">
              <Link href={playerHref(member.playerId)}>
                {member.firstName} {member.lastInitial}
              </Link>
              <span>{consoleCopy.progress.goalStatus[member.goalStatus]}</span>
              <span>
                {consoleCopy.progress.sessions}: {member.weeklySessions}/
                {data?.team.weeklyGoal}
              </span>
              <span>
                {consoleCopy.progress.streak}: {member.currentStreak}
              </span>
              <span>
                {consoleCopy.progress.consistency}: {member.consistencyDays}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
