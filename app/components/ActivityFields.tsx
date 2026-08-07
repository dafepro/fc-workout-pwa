"use client";

import { getActivityInput } from "../domain/rules";
import type { ActivityDefinition, ActivityId } from "../domain/types";

export function ActivitySelector({
  selected,
  onSelect,
  activities,
}: {
  selected: ActivityId;
  onSelect: (activityId: ActivityId) => void;
  activities: ActivityDefinition[];
}) {
  return (
    <fieldset className="activity-picker">
      <legend className="sr-only">Activity</legend>
      <div className="activity-picker__grid">
        {activities.map((activity) => (
          <label
            key={activity.id}
            className={`activity-choice ${selected === activity.id ? "is-selected" : ""}`}
          >
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
            <span>
              <strong>{activity.name}</strong>
            </span>
            {activity.id === "hill-sprints" ? (
              <span
                className="activity-choice__recommended"
                aria-label="Coach pick"
                title="Coach pick"
              >
                ★
              </span>
            ) : null}
          </label>
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
  const activity = getActivityInput(activities, activityId);
  if (!activity) return null;

  return (
    <div className="field-card" data-testid="activity-fields">
      <label htmlFor="activity-value">{activity.fieldLabel}</label>
      {activity.inputKind === "repetitions" ? (
        <div className="stepper">
          <button
            type="button"
            aria-label="Remove one repetition"
            onClick={() => onChange(Math.max(activity.min, value - 1))}
          >
            −
          </button>
          <strong>{value}</strong>
          <button
            type="button"
            aria-label="Add one repetition"
            onClick={() => onChange(Math.min(activity.max, value + 1))}
          >
            +
          </button>
        </div>
      ) : (
        <div className="input-with-unit">
          <input
            id="activity-value"
            type="number"
            inputMode="decimal"
            min={activity.min}
            max={activity.max}
            step={activity.step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            required
          />
          <span>{activity.unit}</span>
        </div>
      )}
      {activityId === "hill-sprints" ? (
        <p className="field-card__context">6 seconds each</p>
      ) : null}
    </div>
  );
}
