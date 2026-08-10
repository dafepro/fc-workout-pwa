"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActivitySelector,
  ActivitySpecificFields,
} from "../components/ActivityFields";
import { IntensityControls } from "../components/IntensityScale";
import { copy } from "../content/copy";
import {
  earliestAllowedDate,
  isBackdateAllowed,
  toDateInput,
} from "../domain/rules";
import type { ActivityId } from "../domain/types";
import { useTraining } from "../state/training-context";

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
  const { addEntry, dashboard, dashboardStatus, refreshDashboard } =
    useTraining();
  const activities = useMemo(() => dashboard?.activities ?? [], [dashboard]);
  const assignment = dashboard?.currentAssignment ?? null;
  const [activityId, setActivityId] = useState<ActivityId>("hill-sprints");
  const [value, setValue] = useState(8);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(currentTimeInput());
  const [effort, setEffort] = useState(4);
  const [exhaustion, setExhaustion] = useState(4);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const initialized = useRef(false);
  const selectedActivity = activities.find((item) => item.id === activityId);

  useEffect(() => {
    if (initialized.current || activities.length === 0) return;
    const selected =
      activities.find((item) => item.id === assignment?.activityDefinitionId) ??
      activities[0];
    initialized.current = true;
    setActivityId(selected.id);
    setValue(
      assignment?.activityDefinitionId === selected.id
        ? assignment.targetValue
        : selected.defaultValue,
    );
  }, [activities, assignment]);

  function chooseActivity(next: ActivityId) {
    setActivityId(next);
    const nextActivity = activities.find((item) => item.id === next);
    setValue(
      assignment?.activityDefinitionId === next
        ? assignment.targetValue
        : (nextActivity?.defaultValue ?? 1),
    );
    setMessage(null);
    setShowActivities(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
    const assignmentId =
      assignment?.activityDefinitionId === activityId &&
      date >= assignment.startsOn &&
      date <= assignment.dueOn
        ? assignment.id
        : undefined;
    const completesAssignment = Boolean(
      assignmentId &&
        assignment &&
        !assignment.completed &&
        activity.unit === assignment.targetUnit &&
        value >= assignment.targetValue,
    );
    setSaving(true);
    setMessage(null);
    try {
      await addEntry({
        activityId,
        inputKind: activity.inputKind,
        assignmentId,
        occurredAt: occurredAt.toISOString(),
        value,
        unit: activity.unit,
        effortLevel: effort,
        exhaustionLevel: exhaustion,
      });
      router.push(`/?saved=1${completesAssignment ? "&completed=1" : ""}`);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "That session could not be saved.",
      );
      setSaving(false);
    }
  }

  if (dashboardStatus === "loading") {
    return <main className="auth-state">Loading approved activities…</main>;
  }

  if (dashboardStatus === "error" || !dashboard || !selectedActivity) {
    return (
      <main className="auth-state" role="alert">
        <h1>Approved activities could not be loaded</h1>
        <button
          className="button button--lime"
          onClick={() => void refreshDashboard()}
        >
          Try again
        </button>
      </main>
    );
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

      <form method="post" className="log-form" onSubmit={submit}>
        <button
          type="button"
          className={`selected-activity selected-activity--${activityId} ${showActivities ? "is-open" : ""}`}
          aria-label={`Selected workout: ${selectedActivity.name}. ${showActivities ? "Close activity choices" : "Choose another activity"}`}
          aria-expanded={showActivities}
          aria-controls="activity-options"
          onClick={() => setShowActivities((visible) => !visible)}
        >
          <span className="selected-activity__icon" aria-hidden="true">
            {selectedActivity.icon}
          </span>
          <span className="selected-activity__copy">
            <small>Workout</small>
            <strong>{selectedActivity.name}</strong>
            <small>{selectedActivity.description}</small>
          </span>
          <span className="selected-activity__chevron" aria-hidden="true">
            {showActivities ? "⌃" : "⌄"}
          </span>
        </button>
        {showActivities ? (
          <div id="activity-options" className="activity-options">
            <ActivitySelector
              selected={activityId}
              onSelect={chooseActivity}
              activities={activities}
              recommended={assignment?.activityDefinitionId}
            />
          </div>
        ) : null}
        <ActivitySpecificFields
          activityId={activityId}
          value={value}
          onChange={setValue}
          activities={activities}
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
        <button
          className="button button--lime button--wide"
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
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
