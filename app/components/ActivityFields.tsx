"use client";

import { getActivityInput } from "../domain/rules";
import type { ActivityDefinition, ActivityId } from "../domain/types";
import { WorkoutInstructions } from "./WorkoutInstructions";

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
  const activity = getActivityInput(activities, activityId);
  if (!activity) return null;

  const decimals = activity.step.toString().split(".")[1]?.length ?? 0;
  const adjust = (direction: -1 | 1) => {
    const next = value + direction * activity.step;
    onChange(
      Number(
        Math.min(activity.max, Math.max(activity.min, next)).toFixed(decimals),
      ),
    );
  };
  const incrementUnit =
    activity.step === 1
      ? { reps: "rep", minutes: "minute", miles: "mile" }[activity.unit]
      : activity.unit;

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
        <button
          type="button"
          aria-label={`Add ${activity.step} ${incrementUnit}`}
          disabled={value >= activity.max}
          onClick={() => adjust(1)}
        >
          +
        </button>
      </div>
      {activityId === "hill-sprints" ? (
        <p className="field-card__context">6 seconds each</p>
      ) : null}
    </div>
  );
}
