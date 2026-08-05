"use client";

import { FormEvent, useState } from "react";
import {
  ActivitySelector,
  ActivitySpecificFields,
} from "../components/ActivityFields";
import { IntensityScale } from "../components/IntensityScale";
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

export default function LogPage() {
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
    setMessage(copy.saveSuccess);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="page page--log">
      <header className="page-header">
        <span className="page-header__icon" aria-hidden="true">
          ↗
        </span>
        <div>
          <p className="eyebrow">A few taps. Then done.</p>
          <h1>Quick training entry</h1>
          <p>Log a coach-approved activity—no notes needed.</p>
        </div>
      </header>

      {message ? (
        <div
          className={`notice ${message === copy.saveSuccess ? "notice--success" : "notice--error"}`}
          role="status"
        >
          <span aria-hidden="true">
            {message === copy.saveSuccess ? "✓" : "!"}
          </span>
          <strong>{message}</strong>
        </div>
      ) : null}

      <form className="log-form" onSubmit={submit}>
        <ActivitySelector selected={activityId} onSelect={chooseActivity} />
        <section className="form-grid" aria-label="Session details">
          <div className="field-card">
            <label htmlFor="session-date">Session date</label>
            <input
              id="session-date"
              type="date"
              min={earliestAllowedDate()}
              max={toDateInput(new Date())}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
            <p className="field-card__context">Today through seven days ago</p>
          </div>
          <div className="field-card">
            <label htmlFor="session-time">Session time</label>
            <input
              id="session-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
            <p className="field-card__context">Use the time you completed it</p>
          </div>
          <ActivitySpecificFields
            activityId={activityId}
            value={value}
            onChange={setValue}
          />
        </section>
        <IntensityScale
          name="effort"
          value={effort}
          onChange={setEffort}
          kind="effort"
        />
        <IntensityScale
          name="exhaustion"
          value={exhaustion}
          onChange={setExhaustion}
          kind="exhaustion"
        />
        {exhaustion >= 6 ? (
          <aside className="recovery-note">
            <span aria-hidden="true">💧</span>
            <p>{copy.recoveryNote}</p>
          </aside>
        ) : null}
        <button className="button button--lime button--wide" type="submit">
          Save session <span aria-hidden="true">→</span>
        </button>
        <p className="form-footnote">
          <span aria-hidden="true">◆</span> {copy.noEditing}
        </p>
      </form>
    </div>
  );
}
