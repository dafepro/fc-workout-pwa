import Image from "next/image";
import Link from "next/link";
import {
  participationAction,
  type ParticipationAction,
} from "../player/participation-action";
import { copy } from "../content/copy";
import { qualityCopy } from "../content/quality-copy";
import type { TeamHubActivity, TeamHubProjection } from "../domain/types";
import { TeamWeekFocus } from "./TeamWeekFocus";
import { TeammateActivity } from "./TeammateActivity";

export function TeamHub({
  hub,
  onCheer,
  onOpenLounge,
  checkIn = participationAction(null),
}: {
  hub: TeamHubProjection;
  onCheer: (row: TeamHubActivity) => void;
  onOpenLounge: () => void;
  checkIn?: ParticipationAction;
}) {
  const labelByAssignment = new Map(
    hub.focus
      .filter((item) => item.kind === "challenge")
      .map((item) => [item.id, `${item.title} challenge`]),
  );
  return (
    <>
      <header className="team-hub-header">
        <div>
          <p className="eyebrow">Team</p>
          <h1>{hub.team.name}</h1>
        </div>
        <button
          type="button"
          className="team-hub-header__lounge-action"
          aria-label={copy.teamHub.goToLounge}
          data-team-lounge-open
          disabled={!hub.access.loungeUnlocked}
          onClick={onOpenLounge}
        >
          <span className="team-hub-header__lounge-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M5 19V9a7 7 0 0 1 14 0v10" />
              <path d="M9 12h7m-3-3 3 3-3 3" />
            </svg>
          </span>
          <span>{copy.teamHub.loungeShortcut}</span>
        </button>
      </header>
      <TeamWeekFocus
        focus={hub.focus.filter(
          (item) => item.state !== "ended" && item.state !== "achieved",
        )}
        weekStart={hub.team.weekStart}
        weekEnd={hub.team.weekEnd}
      />
      {hub.focus.some(
        (item) => item.state === "ended" || item.state === "achieved",
      ) ? (
        <details className="card">
          <summary>{qualityCopy.pastRewards}</summary>
          <TeamWeekFocus
            focus={hub.focus.filter(
              (item) => item.state === "ended" || item.state === "achieved",
            )}
          />
        </details>
      ) : null}
      <TeammateActivity
        lockedDetail={checkIn.detail}
        activeThisWeek={hub.activitySummary.activeThisWeek}
        activity={hub.activity}
        unlocked={hub.access.activityUnlocked}
        contextLabel={(row) => reactionLabel(row, labelByAssignment)}
        onCheer={onCheer}
      />
      <section className="team-lounge-preview" aria-label="Team Lounge preview">
        <div className="team-lounge-preview__art" aria-hidden="true">
          <Image
            src="/team-lounge/beach-boardwalk-v1.png"
            alt=""
            width={512}
            height={512}
            loading="eager"
            unoptimized
          />
        </div>
        <div className="team-lounge-preview__content">
          <p className="eyebrow">{copy.teamHub.loungeEyebrow}</p>
          <h2>{copy.teamHub.loungeTitle}</h2>
          <p>
            {hub.access.loungeUnlocked
              ? copy.teamHub.loungeDetail
              : checkIn.detail}
          </p>
          {hub.access.loungeUnlocked ? (
            <button
              type="button"
              className="button button--lime team-lounge-preview__action"
              data-team-lounge-open
              disabled={!hub.access.loungeUnlocked}
              onClick={onOpenLounge}
            >
              {copy.teamHub.openLounge}
            </button>
          ) : (
            <Link
              className="button button--lime team-lounge-preview__action"
              href={checkIn.href}
            >
              {checkIn.label}
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

function reactionLabel(
  row: TeamHubActivity,
  labelByAssignment: Map<string, string>,
): string {
  const context = row.reactionContext;
  if (context?.type === "challenge") {
    return labelByAssignment.get(context.assignmentId) ?? "Team challenge";
  }
  return "Team progress";
}
