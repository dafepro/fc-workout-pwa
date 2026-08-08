"use client";

import { useState } from "react";
import { copy } from "../content/copy";
import { getActivityInput } from "../domain/rules";
import type { ActivityDefinition, ActivityId } from "../domain/types";
import { WorkoutInstructions } from "./WorkoutInstructions";

const singularUnits: Record<string, string> = {
  reps: "rep",
  minutes: "minute",
  miles: "mile",
};

function unitLabel(count: number, unit: string): string {
  return count === 1 ? (singularUnits[unit] ?? unit) : unit;
}

export function ActivitySelector({
  selected,
  onSelect,
  activities,
  recommended,
}: {
  selected: ActivityId;
  onSelect: (activityId: ActivityId) => void;
  activities: ActivityDefinition[];
  recommended?: ActivityId;
}) {
  return (
    <fieldset className="activity-picker">
      <legend className="sr-only">Activity</legend>
      <div className="activity-picker__grid">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={`activity-choice ${selected === activity.id ? "is-selected" : ""}`}
          >
            <label>
              <input
                type="radio"
                name="activity"
                value={activity.id}
                checked={selected === activity.id}
                onChange={() => onSelect(activity.id)}
              />
              <span className="activity-choice__icon" aria-hidden="true">
                {activity.icon}
              </span>
              <span className="activity-choice__copy">
                <strong>{activity.name}</strong>
                <small>{activity.description}</small>
              </span>
            </label>
            {activity.id === recommended ? (
              <span
                className="activity-choice__recommended"
                aria-label="Coach pick"
                title="Coach pick"
              >
                ★
              </span>
            ) : null}
            <WorkoutInstructions
              activityName={activity.name}
              instructions={activity.instructions}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function ActivitySpecificFields({
  activityId,
  value,
  onChange,
  activities,
}: {
  activityId: ActivityId;
  value: number;
  onChange: (value: number) => void;
  activities: ActivityDefinition[];
}) {
  // A separate draft keeps a half-typed or cleared field from being rewritten
  // as "0", which forced players to delete a leading zero on every entry. It is
  // tagged with its activity so switching activities discards it.
  const [draft, setDraft] = useState<{ activityId: string; text: string }>();
  const activity = getActivityInput(activities, activityId);
  if (!activity) return null;

  const shown = draft?.activityId === activityId ? draft.text : value;

  const decimals = activity.step.toString().split(".")[1]?.length ?? 0;
  const commit = (next: number) => {
    setDraft(undefined);
    onChange(Number(next.toFixed(decimals)));
  };
  const adjust = (direction: -1 | 1) =>
    commit(
      Math.min(
        activity.max,
        Math.max(activity.min, value + direction * activity.step),
      ),
    );
  const incrementUnit = unitLabel(activity.step, activity.unit);
  const limit =
    value > activity.max
      ? copy.log.overMax(activity.max, unitLabel(activity.max, activity.unit))
      : value < activity.min
        ? copy.log.underMin(
            activity.min,
            unitLabel(activity.min, activity.unit),
          )
        : null;

  return (
    <div className="field-card" data-testid="activity-fields">
      <label htmlFor="activity-value">{activity.fieldLabel}</label>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Remove ${activity.step} ${incrementUnit}`}
          disabled={value <= activity.min}
          onClick={() => adjust(-1)}
        >
          −
        </button>
        <div className={`value-entry ${limit ? "is-over-limit" : ""}`}>
          <input
            id="activity-value"
            type="number"
            inputMode="decimal"
            min={activity.min}
            max={activity.max}
            step={activity.step}
            value={shown}
            aria-invalid={limit ? "true" : "false"}
            aria-describedby={limit ? "activity-value-limit" : undefined}
            onChange={(event) => {
              const text = event.target.value;
              setDraft({ activityId, text });
              if (text !== "") onChange(Number(text));
            }}
            onBlur={() => setDraft(undefined)}
            required
          />
          <span className="value-entry__unit">{activity.unit}</span>
        </div>
        <button
          type="button"
          aria-label={`Add ${activity.step} ${incrementUnit}`}
          disabled={value >= activity.max}
          onClick={() => adjust(1)}
        >
          +
        </button>
      </div>
      {limit ? (
        <p
          className="field-card__limit"
          id="activity-value-limit"
          role="status"
        >
          <span aria-hidden="true">!</span>
          {limit}
        </p>
      ) : activityId === "hill-sprints" ? (
        <p className="field-card__context">6 seconds each</p>
      ) : null}
    </div>
  );
}
