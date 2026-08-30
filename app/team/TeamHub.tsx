import Image from "next/image";
import { copy } from "../content/copy";
import type { TeamHubActivity, TeamHubProjection } from "../domain/types";
import { TeamWeekFocus } from "./TeamWeekFocus";
import { TeammateActivity } from "./TeammateActivity";

export function TeamHub({
  hub,
  onCheer,
  onOpenLounge,
}: {
  hub: TeamHubProjection;
  onCheer: (row: TeamHubActivity) => void;
  onOpenLounge: () => void;
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
          className="button button--lime team-hub-header__lounge"
          data-team-lounge-open
          disabled={!hub.access.loungeUnlocked}
          onClick={onOpenLounge}
        >
          {copy.teamHub.openLounge}
        </button>
      </header>
      <TeamWeekFocus focus={hub.focus} />
      <TeammateActivity
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
        <div>
          <p className="eyebrow">{copy.teamHub.loungeEyebrow}</p>
          <h2>{copy.teamHub.loungeTitle}</h2>
          <p>
            {hub.access.loungeUnlocked
              ? copy.teamHub.loungeDetail
              : copy.teamHub.loungeLocked}
          </p>
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
