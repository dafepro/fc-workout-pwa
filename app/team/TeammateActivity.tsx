"use client";

import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { copy } from "../content/copy";
import type { TeamHubActivity } from "../domain/types";

export function TeammateActivity({
  activeThisWeek,
  activity,
  unlocked,
  contextLabel,
  onCheer,
}: {
  activeThisWeek: number;
  activity: TeamHubActivity[];
  unlocked: boolean;
  contextLabel: (row: TeamHubActivity) => string;
  onCheer: (row: TeamHubActivity) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = activity.slice(0, expanded ? 5 : 3);
  return (
    <section
      className="team-hub-card teammate-activity"
      aria-labelledby="teammate-activity-title"
      aria-label={copy.teamHub.activityTitle}
    >
      <header className="team-hub-card__heading">
        <div>
          <p className="eyebrow">{copy.teamHub.activityEyebrow}</p>
          <h2 id="teammate-activity-title">{copy.teamHub.activityTitle}</h2>
        </div>
        {unlocked ? (
          <span className="teammate-activity__summary">
            {copy.teamHub.activeThisWeek(activeThisWeek)}
          </span>
        ) : null}
      </header>
      {!unlocked ? (
        <div className="teammate-activity__locked">
          <span aria-hidden="true">◆</span>
          <div>
            <strong>{copy.teamHub.lockedTitle}</strong>
            <p>{copy.teamHub.lockedDetail}</p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="team-hub-card__empty">{copy.teamHub.activityEmpty}</p>
      ) : (
        <ul aria-label={copy.teamHub.activityTitle}>
          {visible.map((row) => {
            const label = contextLabel(row);
            return (
              <li key={row.player.id}>
                <Avatar player={row.player} size="small" />
                <div className="teammate-activity__person">
                  <strong>
                    {row.player.firstName} {row.player.lastInitial}
                  </strong>
                  <span className="teammate-activity__signals">
                    {row.signals.map((signal) => (
                      <small key={signal.kind}>
                        {copy.teamHub.signals[signal.kind]}
                      </small>
                    ))}
                  </span>
                </div>
                {row.reactionContext ? (
                  <button
                    type="button"
                    aria-label={`Cheer for ${row.player.firstName} ${row.player.lastInitial} for ${label}`}
                    onClick={() => onCheer(row)}
                  >
                    <span aria-hidden="true">👏</span>
                    {copy.teamHub.cheer}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {unlocked && activity.length > 3 ? (
        <button
          type="button"
          className="teammate-activity__expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? copy.teamHub.showLess : copy.teamHub.showMore}
        </button>
      ) : null}
      {unlocked ? (
        <small className="teammate-activity__private">
          {copy.teamHub.privateCheers}
        </small>
      ) : null}
    </section>
  );
}
