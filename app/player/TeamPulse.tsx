import Link from "next/link";
import { copy } from "../content/copy";
import type { TrainingDashboard } from "../domain/types";

interface TeamPulseProps {
  projection: TrainingDashboard["teamPulse"];
}

export function TeamPulse({ projection }: TeamPulseProps) {
  const teamPulseCopy = copy.teamPulse;

  return (
    <section className="card team-preview" aria-labelledby="team-pulse-title">
      <div>
        <p className="eyebrow">{teamPulseCopy.eyebrow}</p>
        <h2 id="team-pulse-title">
          {projection.unlocked
            ? teamPulseCopy.activeThisWeek(projection.activeThisWeek)
            : teamPulseCopy.lockedTitle}
        </h2>
        <p>
          {projection.unlocked
            ? teamPulseCopy.encouragement
            : teamPulseCopy.lockedDetail}
        </p>
      </div>

      {projection.unlocked && projection.recentActivities.length > 0 ? (
        <ul
          className="team-preview__activity"
          aria-label={teamPulseCopy.listLabel}
        >
          {projection.recentActivities.map((activity, index) => (
            <li key={`${activity.firstName}-${activity.lastInitial}-${index}`}>
              <strong>
                {activity.firstName} {normalizedInitial(activity.lastInitial)}
              </strong>
              <span>
                {activity.activityName} · {activity.recency}
              </span>
            </li>
          ))}
        </ul>
      ) : projection.unlocked ? (
        <p className="team-preview__empty">{teamPulseCopy.empty}</p>
      ) : null}

      <Link className="button button--outline" href="/team">
        {teamPulseCopy.action}
      </Link>
    </section>
  );
}

function normalizedInitial(value: string): string {
  return `${value.replace(/\.$/, "")}.`;
}
