"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActivitySpecificFields } from "../components/ActivityFields";
import { WorkoutSelect } from "../components/WorkoutSelect";
import { WorkoutOutcomeChoices } from "../components/WorkoutOutcomeChoices";
import { IntensityControls } from "../components/IntensityScale";
import { copy } from "../content/copy";
import {
  isBackdateAllowed,
  plannedActivityTarget,
  toDateInput,
} from "../domain/rules";
import type {
  ActivityId,
  CompletionOutcome,
  TrainingPlanProvenance,
} from "../domain/types";
import { useTraining } from "../state/training-context";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";
import { useLocalSessionClock } from "./useLocalSessionClock";

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
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const additionalMode = pathname === "/log/additional";
  const analytics = useAnalytics();
  const { addEntry, dashboard, dashboardStatus, refreshDashboard } =
    useTraining();
  const activities = useMemo(() => dashboard?.activities ?? [], [dashboard]);
  const assignment = dashboard?.currentAssignment ?? null;
  const [selection, setSelection] = useState<{
    activityId: ActivityId;
    value: number;
  } | null>(null);
  const clock = useLocalSessionClock();
  const [effort, setEffort] = useState(4);
  const [exhaustion, setExhaustion] = useState(4);
  const [completionOutcome, setCompletionOutcome] =
    useState<CompletionOutcome>("as_listed");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const planDay = dashboard?.currentPlanDay ?? null;
  const requestedPlanBlock = useMemo(() => {
    if (!planDay || searchParameters.get("planId") !== planDay.planId) {
      return null;
    }
    const rawDayIndex = searchParameters.get("dayIndex");
    const rawBlockIndex = searchParameters.get("blockIndex");
    const activity = searchParameters.get("activityId");
    if (
      !rawDayIndex?.match(/^\d+$/) ||
      !rawBlockIndex?.match(/^\d+$/) ||
      Number(rawDayIndex) !== planDay.dayIndex
    ) {
      return null;
    }
    const blockIndex = Number(rawBlockIndex);
    return (
      planDay.blocks.find(
        (block) =>
          block.blockIndex === blockIndex &&
          block.activityDefinitionId === activity &&
          !block.completed,
      ) ?? null
    );
  }, [planDay, searchParameters]);
  const suggestedActivity = additionalMode
    ? undefined
    : (activities.find(
        (item) => item.id === requestedPlanBlock?.activityDefinitionId,
      ) ??
      activities.find((item) => item.id === assignment?.activityDefinitionId) ??
      activities[0]);
  const recommendedActivityId =
    requestedPlanBlock?.activityDefinitionId ??
    assignment?.activityDefinitionId;
  const activityId = selection?.activityId ?? suggestedActivity?.id ?? "";
  const value =
    selection?.value ??
    (suggestedActivity
      ? requestedPlanBlock?.activityDefinitionId === suggestedActivity.id
        ? plannedActivityTarget(suggestedActivity, requestedPlanBlock)
        : assignment?.activityDefinitionId === suggestedActivity.id
          ? assignment.targetValue
          : suggestedActivity.defaultValue
      : 1);
  const selectedActivity = activities.find((item) => item.id === activityId);

  function chooseActivity(next: ActivityId) {
    const nextActivity = activities.find((item) => item.id === next);
    setSelection({
      activityId: next,
      value:
        assignment?.activityDefinitionId === next
          ? assignment.targetValue
          : (nextActivity?.defaultValue ?? 1),
    });
    setMessage(null);
    analytics.track("training_activity_selected", {
      activity: next,
      defaulted_activity: false,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !clock.ready) return;
    if (!isBackdateAllowed(clock.date)) {
      setMessage("Choose today or one of the previous seven days.");
      return;
    }
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      setMessage(copy.log.chooseBeforeSaving);
      return;
    }
    if (value < activity.min || value > activity.max) {
      setMessage(
        `Enter a value from ${activity.min} to ${activity.max} ${activity.unit}.`,
      );
      return;
    }
    const occurredAt = new Date(`${clock.date}T${clock.time}:00`);
    const assignmentId =
      !requestedPlanBlock &&
      assignment?.activityDefinitionId === activityId &&
      clock.date >= assignment.startsOn &&
      clock.date <= assignment.dueOn
        ? assignment.id
        : undefined;
    const plan: TrainingPlanProvenance | undefined =
      requestedPlanBlock &&
      planDay &&
      clock.date === planDay.occursOn &&
      requestedPlanBlock.activityDefinitionId === activityId
        ? {
            planId: planDay.planId,
            dayIndex: planDay.dayIndex,
            blockIndex: requestedPlanBlock.blockIndex,
          }
        : undefined;
    const completesPrimary = Boolean(
      plan
        ? completionOutcome !== "partial" &&
            planDay?.blocks.filter((block) => !block.completed).length === 1
        : assignmentId &&
            assignment &&
            !assignment.completed &&
            completionOutcome !== "partial" &&
            activity.unit === assignment.targetUnit &&
            value >= assignment.targetValue,
    );
    setSaving(true);
    setMessage(null);
    try {
      await addEntry({
        activityId: activity.id,
        inputKind: activity.inputKind,
        assignmentId,
        plan,
        occurredAt: occurredAt.toISOString(),
        value,
        unit: activity.unit,
        effortLevel: effort,
        exhaustionLevel: exhaustion,
        completionOutcome,
      });
      router.push(`/?saved=1${completesPrimary ? "&completed=1" : ""}`);
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

  if (dashboardStatus === "error" || !dashboard) {
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
          <h1>
            {additionalMode ? copy.log.additionalTitle : "Record Training"}
          </h1>
        </div>
      </header>

      {additionalMode ? (
        <p className="log-safety-note">{copy.log.additionalIntro}</p>
      ) : null}

      {message ? (
        <div className="notice notice--error" role="status">
          <span aria-hidden="true">!</span>
          <strong>{message}</strong>
        </div>
      ) : null}

      <form method="post" className="log-form" onSubmit={submit}>
        <WorkoutSelect
          label="Workout"
          selectedKey={activityId}
          placeholder={additionalMode ? copy.log.chooseActivity : undefined}
          onSelect={(key) => chooseActivity(key as ActivityId)}
          choices={activities.map((activity) => ({
            key: activity.id,
            name: activity.name,
            description: activity.description,
            icon: activity.icon,
            instructions: activity.instructions,
            recommended: activity.id === recommendedActivityId,
          }))}
        />
        {selectedActivity ? (
          <>
            <ActivitySpecificFields
              activityId={selectedActivity.id}
              value={value}
              onChange={(nextValue) =>
                setSelection({
                  activityId: selectedActivity.id,
                  value: nextValue,
                })
              }
              activities={activities}
            />
            <WorkoutOutcomeChoices
              value={completionOutcome}
              onChange={setCompletionOutcome}
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
          </>
        ) : null}
        <button
          className="button button--lime button--wide"
          type="submit"
          disabled={saving || !clock.ready || !selectedActivity}
        >
          {saving
            ? "Saving…"
            : selectedActivity && additionalMode
              ? copy.log.saveActivity(
                  value,
                  selectedActivity.unit,
                  selectedActivity.name,
                )
              : selectedActivity
                ? "Save"
                : copy.log.chooseBeforeSaving}
        </button>
        <details className="when-details">
          <summary>
            <span aria-hidden="true">◷</span>
            <strong>
              {clock.ready
                ? `${compactDateLabel(clock.date)} · ${compactTimeLabel(clock.time)}`
                : "Setting local date and time…"}
            </strong>
            <span>Change</span>
          </summary>
          <div className="when-details__fields">
            <label htmlFor="session-date">
              Date
              <input
                id="session-date"
                type="date"
                min={clock.earliestDate || undefined}
                max={clock.today || undefined}
                value={clock.date}
                onChange={(event) => clock.setDate(event.target.value)}
                required
              />
            </label>
            <label htmlFor="session-time">
              Time
              <input
                id="session-time"
                type="time"
                value={clock.time}
                onChange={(event) => clock.setTime(event.target.value)}
                required
              />
            </label>
          </div>
        </details>
      </form>
    </div>
  );
}
