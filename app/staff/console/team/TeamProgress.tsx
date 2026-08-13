"use client";

import { consoleCopy } from "../copy";
import { ConsoleNotice } from "../ConsoleChrome";
import { ConsoleRowLink } from "../ConsoleRowLink";
import { useResource } from "../useResource";
import type {
  TeamProgress as TeamProgressData,
  TeamProgressMember,
} from "../types";

/**
 * REQ-516. How the team is tracking against its weekly goal, and how each
 * player is going, from the same projection the players' own Team screen reads.
 * Nothing here is calculated a second time, so a coach and a player can never
 * be told different things about who met the goal.
 *
 * Alpha 1.1 grouped the players. A flat list with a status word in the middle
 * of four unlabelled numbers made the word carry the whole meaning, and it was
 * the same word the assignment panel used for a different question. The
 * grouping is the layout now, each heading names the weekly goal it is about,
 * and every number beside a name says what it counts.
 */
export function TeamProgress({
  teamId,
  playerBase,
}: {
  teamId: string;
  playerBase: string;
}) {
  const progress = useResource<TeamProgressData>(
    `v1/staff/teams/${teamId}/progress`,
  );
  const data = progress.data;
  const goal = data?.team.weeklyGoal ?? 0;
  const members = data?.members ?? [];

  const groups: {
    key: string;
    label: string;
    members: TeamProgressMember[];
  }[] = [
    {
      key: "completed",
      label: consoleCopy.progress.goalStatus.completed(goal),
      members: members.filter((member) => member.goalStatus === "completed"),
    },
    {
      key: "one_away",
      label: consoleCopy.progress.goalStatus.one_away,
      members: members.filter((member) => member.goalStatus === "one_away"),
    },
    {
      key: "keep_going",
      label: consoleCopy.progress.goalStatus.keep_going,
      members: members.filter((member) => member.goalStatus === "keep_going"),
    },
  ];

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
        <p className="console-hint">{consoleCopy.progress.goalHint(goal)}</p>
        <p className="console-hint">{consoleCopy.progress.privacy}</p>
        {data && members.length === 0 ? (
          <p>{consoleCopy.progress.empty}</p>
        ) : null}

        {/* An empty group is still worth a heading: "nobody has reached it yet"
            is a fact a coach wants, and a group that vanishes reads as though
            the screen is still loading. */}
        {data
          ? groups.map((group) => (
              <section
                key={group.key}
                className="progress-group"
                aria-label={group.label}
              >
                <h3 className="progress-group__title">
                  {group.label}{" "}
                  <span className="progress-group__count">
                    {consoleCopy.progress.groupCount(
                      group.members.length,
                      members.length,
                    )}
                  </span>
                </h3>
                {group.members.length === 0 ? (
                  <p className="console-hint">
                    {consoleCopy.assignments.noPlayers}
                  </p>
                ) : (
                  <ul className="console-list">
                    {group.members.map((member) => (
                      <ConsoleRowLink
                        key={member.playerId}
                        href={`${playerBase}/${member.playerId}`}
                        name={`${member.firstName} ${member.lastInitial}`}
                      >
                        <span>
                          {consoleCopy.progress.sessions}:{" "}
                          {member.weeklySessions}/{goal}
                        </span>
                        <span>
                          {consoleCopy.progress.streak}: {member.currentStreak}
                        </span>
                        <span>
                          {consoleCopy.progress.consistency}:{" "}
                          {member.consistencyDays}
                        </span>
                      </ConsoleRowLink>
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}
      </section>
    </>
  );
}
