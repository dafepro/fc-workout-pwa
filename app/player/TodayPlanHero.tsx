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
  const title =
    day.kind === "rest" ? "Planned rest" : (nextBlock?.label ?? "Today’s plan");
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
      className={`hero-card ${complete ? "hero-card--complete" : ""} ${celebrating ? "is-celebrating" : ""}`}
      aria-labelledby="plan-day-title"
      aria-live={complete ? "polite" : undefined}
    >
      <div className="hero-card__content">
        <p className="eyebrow eyebrow--lime">
          {complete ? "Today complete" : "Coach plan"}
        </p>
        <h1 id="plan-day-title">{title}</h1>
        <p className="hero-card__detail">
          {day.kind === "rest"
            ? "Recovery is part of the plan"
            : `${day.durationMinutes} min · ${capitalize(day.intensity)}`}
        </p>
        <p className="hero-card__support">
          {complete
            ? day.kind === "rest"
              ? "Your planned-rest check-in is saved."
              : "Your planned workout is checked in."
            : `Day ${dayNumber} of ${dayCount} · ${capitalize(day.focus)}`}
        </p>
        {!complete && day.kind === "rest" ? (
          <button
            className="button button--lime"
            type="button"
            disabled={savingRest}
            onClick={() => void saveRest()}
          >
            {savingRest ? "Saving…" : "Check in for planned rest"}
          </button>
        ) : null}
        {!complete && day.kind !== "rest" && nextBlock && activityAvailable ? (
          <Link
            className="button button--lime"
            href={planLogHref(
              day,
              nextBlock.blockIndex,
              nextBlock.activityDefinitionId,
            )}
          >
            Log this workout <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {!complete && day.kind !== "rest" && !activityAvailable ? (
          <p className="hero-card__warning" role="alert">
            This planned activity needs an update from your coach.
          </p>
        ) : null}
        {error ? (
          <p className="hero-card__warning" role="alert">
            {error}
          </p>
        ) : null}
        {day.blocks.length > 1 ? (
          <ul className="hero-card__blocks" aria-label="Today’s workout blocks">
            {day.blocks.map((block) => (
              <li key={block.blockIndex}>
                <span aria-hidden="true">{block.completed ? "✓" : "○"}</span>
                {block.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div
        className={`hill-art ${complete ? "hill-art--complete" : ""}`}
        aria-hidden="true"
      >
        <span className="hill-art__sun">✦</span>
        {complete ? <span className="completion-check">✓</span> : null}
        <span className="hill-art__runner">
          {day.kind === "rest" ? "☁️" : "🏃"}
        </span>
      </div>
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
