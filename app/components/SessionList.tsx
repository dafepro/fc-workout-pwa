"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActivityDefinition, TrainingEntry } from "../domain/types";
import { SessionFeelings } from "./SessionFeelings";

export function SessionList({
  entries,
  activities,
  initialVisible = 3,
}: {
  entries: TrainingEntry[];
  activities: ActivityDefinition[];
  initialVisible?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);

  return (
    <section className="card recent-card">
      <div className="section-heading">
        <h2>My Sessions</h2>
      </div>
      <div className="history-list">
        {entries.length === 0 ? (
          <p className="history-list__empty">No sessions saved yet.</p>
        ) : null}
        {entries.slice(0, visibleCount).map((entry) => {
          const activity = activities.find(
            (item) => item.id === entry.activityId,
          );
          if (!activity) return null;
          return (
            <Link
              className={`history-row history-row--${activity.id}`}
              href={`/sessions/${entry.id}`}
              key={entry.id}
              aria-label={`View ${activity.name} session details`}
            >
              <span className="history-row__icon" aria-hidden="true">
                {activity.icon}
              </span>
              <div>
                <strong>{activity.name}</strong>
                <p>
                  {new Date(entry.occurredAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {entry.value} {entry.unit}
                </p>
              </div>
              <SessionFeelings
                effort={entry.effortLevel}
                exhaustion={entry.exhaustionLevel}
              />
              <span className="history-row__arrow" aria-hidden="true">
                →
              </span>
            </Link>
          );
        })}
      </div>
      {visibleCount < entries.length ? (
        <button
          className="history-load-more"
          type="button"
          aria-label="Load more sessions"
          onClick={() => setVisibleCount((count) => count + 3)}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      ) : null}
    </section>
  );
}
