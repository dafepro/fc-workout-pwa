"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActivitySelector,
  ActivitySpecificFields,
} from "../components/ActivityFields";
import { IntensityControls } from "../components/IntensityScale";
import { copy } from "../content/copy";
import { activities, CURRENT_PLAYER_ID } from "../data/mockData";
import {
  createDeleteDeadline,
  earliestAllowedDate,
  isBackdateAllowed,
  toDateInput,
} from "../domain/rules";
import type { ActivityId, TrainingEntry } from "../domain/types";
import { useTraining } from "../state/training-context";

const initialValues: Record<ActivityId, number> = {
  "hill-sprints": 8,
  "timed-run-walk": 20,
  "distance-run": 1.5,
  "recovery-walk-jog": 20,
};

function currentTimeInput(): string {
  return new Date().toTimeString().slice(0, 5);
}

function compactDateLabel(dateValue: string): string {
  const today = toDateInput(new Date());
  if (dateValue === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateValue === toDateInput(yesterday)) return "Yesterday";
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function compactTimeLabel(timeValue: string): string {
  return new Date(`2000-01-01T${timeValue}:00`).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LogPage() {
  const router = useRouter();
  const { addEntry } = useTraining();
  const [activityId, setActivityId] = useState<ActivityId>("hill-sprints");
  const [value, setValue] = useState(initialValues[activityId]);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(currentTimeInput());
  const [effort, setEffort] = useState(4);
  const [exhaustion, setExhaustion] = useState(4);
  const [message, setMessage] = useState<string | null>(null);

  function chooseActivity(next: ActivityId) {
    setActivityId(next);
    setValue(initialValues[next]);
    setMessage(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBackdateAllowed(date)) {
      setMessage("Choose today or one of the previous seven days.");
      return;
    }
    const activity = activities.find((item) => item.id === activityId)!;
    if (value < activity.min || value > activity.max) {
      setMessage(
        `Enter a value from ${activity.min} to ${activity.max} ${activity.unit}.`,
      );
      return;
    }
    const occurredAt = new Date(`${date}T${time}:00`);
    const now = new Date();
    const entry: TrainingEntry = {
      id: crypto.randomUUID(),
      playerId: CURRENT_PLAYER_ID,
      activityId,
      occurredAt: occurredAt.toISOString(),
      value,
      unit: activity.unit,
      effortLevel: effort,
      exhaustionLevel: exhaustion,
      createdAt: now.toISOString(),
      deleteEligibleUntil: createDeleteDeadline(now),
    };
    addEntry(entry);
    router.push("/?saved=1");
  }

  return (
    <div className="page page--log">
      <header className="page-header record-header">
        <span className="page-header__icon" aria-hidden="true">
          ↗
        </span>
        <div>
          <h1>Record Training</h1>
        </div>
      </header>

      {message ? (
        <div className="notice notice--error" role="status">
          <span aria-hidden="true">!</span>
          <strong>{message}</strong>
        </div>
      ) : null}

      <form className="log-form" onSubmit={submit}>
        <ActivitySelector selected={activityId} onSelect={chooseActivity} />
        <ActivitySpecificFields
          activityId={activityId}
          value={value}
          onChange={setValue}
        />
        <IntensityControls
          effort={effort}
          exhaustion={exhaustion}
          onEffortChange={setEffort}
          onExhaustionChange={setExhaustion}
        />
        {exhaustion >= 6 ? (
          <aside className="recovery-note">
            <span aria-hidden="true">💧</span>
            <p>{copy.recoveryNote}</p>
          </aside>
        ) : null}
        <button className="button button--lime button--wide" type="submit">
          Save
        </button>
        <details className="when-details">
          <summary>
            <span aria-hidden="true">◷</span>
            <strong>
              {compactDateLabel(date)} · {compactTimeLabel(time)}
            </strong>
            <span>Change</span>
          </summary>
          <div className="when-details__fields">
            <label htmlFor="session-date">
              Date
              <input
                id="session-date"
                type="date"
                min={earliestAllowedDate()}
                max={toDateInput(new Date())}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <label htmlFor="session-time">
              Time
              <input
                id="session-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </label>
          </div>
        </details>
      </form>
    </div>
  );
}
