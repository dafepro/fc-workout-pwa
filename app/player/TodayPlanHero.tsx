"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ActivityDefinition,
  CurrentTrainingPlanDay,
} from "../domain/types";

export function TodayPlanHero({
  day,
  dayNumber,
  dayCount,
  activities,
  onRecordRest,
  celebrating = false,
}: {
  day: CurrentTrainingPlanDay;
  dayNumber: number;
  dayCount: number;
  activities: Pick<ActivityDefinition, "id" | "name">[];
  onRecordRest(planID: string, dayIndex: number): Promise<void>;
  celebrating?: boolean;
}) {
  const [savingRest, setSavingRest] = useState(false);
  const [restSaved, setRestSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextBlock =
    day.blocks.find((block) => !block.completed) ?? day.blocks[0] ?? null;
  const activityAvailable =
    nextBlock === null ||
    activities.some(
      (activity) => activity.id === nextBlock.activityDefinitionId,
    );
  const plannedActivity = activities.find(
    (activity) => activity.id === nextBlock?.activityDefinitionId,
  );
  const title =
    day.kind === "rest"
      ? "Planned rest"
      : (plannedActivity?.name ?? nextBlock?.label ?? "Today’s plan");
  const complete = day.completed || restSaved;

  async function saveRest() {
    if (savingRest) return;
    setSavingRest(true);
    setError(null);
    try {
      await onRecordRest(day.planId, day.dayIndex);
      setRestSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Planned rest could not be saved.",
      );
    } finally {
      setSavingRest(false);
    }
  }

  return (
    <section
      className={`today-plan-hero${day.kind === "rest" ? " today-plan-hero--rest" : ""}${complete ? " today-plan-hero--complete" : ""}${celebrating ? " is-celebrating" : ""}`}
      aria-labelledby="plan-day-title"
      aria-live={complete ? "polite" : undefined}
    >
      <header className="today-plan-hero__header">
        <div>
          <span className="today-plan-hero__today">Today</span>
          <small>{complete ? "Complete" : "Coach plan"}</small>
        </div>
        {complete ? (
          <span className="today-plan-hero__complete-mark" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </header>
      <h1 id="plan-day-title">{title}</h1>
      <div className="today-plan-hero__metadata">
        <span>
          {day.kind === "rest"
            ? "Planned recovery"
            : `${day.durationMinutes} min`}
        </span>
        <span>{capitalize(day.intensity)}</span>
        <span>
          Day {dayNumber} of {dayCount}
        </span>
      </div>
      <p className="today-plan-hero__goal">
        {complete
          ? day.kind === "rest"
            ? "Your planned-rest check-in is saved."
            : "Your planned workout is checked in."
          : capitalize(day.focus)}
      </p>
      {!complete && day.kind === "rest" ? (
        <button
          className="today-plan-hero__primary"
          type="button"
          disabled={savingRest}
          onClick={() => void saveRest()}
        >
          {savingRest ? "Saving…" : "Check in for planned rest"}
        </button>
      ) : null}
      {!complete && day.kind !== "rest" && nextBlock && activityAvailable ? (
        <Link
          className="today-plan-hero__primary"
          href={planLogHref(
            day,
            nextBlock.blockIndex,
            nextBlock.activityDefinitionId,
          )}
        >
          Record this workout <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      {!complete && day.kind !== "rest" && !activityAvailable ? (
        <p className="today-plan-hero__error" role="alert">
          This planned activity needs an update from your coach.
        </p>
      ) : null}
      {error ? (
        <p className="today-plan-hero__error" role="alert">
          {error}
        </p>
      ) : null}
      {day.blocks.length > 1 ? (
        <ul
          className="today-plan-hero__details"
          aria-label="Today’s workout blocks"
        >
          {day.blocks.map((block) => (
            <li key={block.blockIndex}>
              <span aria-hidden="true">{block.completed ? "✓" : "○"}</span>
              {block.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function planLogHref(
  day: CurrentTrainingPlanDay,
  blockIndex: number,
  activityID: string,
) {
  const parameters = new URLSearchParams({
    planId: day.planId,
    dayIndex: String(day.dayIndex),
    blockIndex: String(blockIndex),
    activityId: activityID,
  });
  return `/log?${parameters.toString()}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
