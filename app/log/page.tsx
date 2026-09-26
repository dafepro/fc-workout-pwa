"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActivitySpecificFields } from "../components/ActivityFields";
import { WorkoutSelect } from "../components/WorkoutSelect";
import { WorkoutOutcomeChoices } from "../components/WorkoutOutcomeChoices";
import { IntensityControls } from "../components/IntensityScale";
import { copy } from "../content/copy";
import { qualityCopy } from "../content/quality-copy";
import {
  isBackdateAllowed,
  plannedActivityTarget,
  toDateInput,
} from "../domain/rules";
import type {
  ActivityId,
  TrainingPlanProvenance,
  TrainingEntryInput,
} from "../domain/types";
import { TrainingEntryGatewayError } from "../data/training-entry-gateway";
import { submissionAttempt } from "./submission";
import { useAuth } from "../state/auth-context";
import { usePlayerDraft } from "../state/player-drafts";
import { isTrainingDraft, type TrainingDraft } from "./draft";
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
  const { currentPlayerID, runtime } = useAuth();
  const draftStore = usePlayerDraft(
    `${currentPlayerID}/${runtime.currentTeam.id}${pathname}?${searchParameters.toString()}`,
    isTrainingDraft,
  );
  const draft = draftStore.value;
  const { addEntry, dashboard, dashboardStatus, refreshDashboard } =
    useTraining();
  const activities = useMemo(() => dashboard?.activities ?? [], [dashboard]);
  const assignment = dashboard?.currentAssignment ?? null;
  const selection = draft?.selection ?? null;
  const clock = useLocalSessionClock();
  const effort = draft?.effort ?? 4;
  const exhaustion = draft?.exhaustion ?? 4;
  const completionOutcome = draft?.completionOutcome ?? "as_listed";
  const date = draft?.date ?? clock.date;
  const time = draft?.time ?? clock.time;
  function updateDraft(patch: Partial<TrainingDraft>) {
    draftStore.set({
      selection,
      date,
      time,
      effort,
      exhaustion,
      completionOutcome,
      ...draft,
      attempt: undefined,
      ...patch,
    });
  }
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
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
      activities.find((item) => item.id === assignment?.activityDefinitionId));
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
    const nextSelection = {
      activityId: next,
      value:
        assignment?.activityDefinitionId === next
          ? assignment.targetValue
          : (nextActivity?.defaultValue ?? 1),
    };
    updateDraft({
      selection: nextSelection,
      amountText: String(nextSelection.value),
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
    if (!isBackdateAllowed(date)) {
      setMessage("Choose today or one of the previous seven days.");
      return;
    }
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      setMessage(copy.log.chooseBeforeSaving);
      return;
    }
    if (
      draft?.amountText === "" ||
      !Number.isFinite(value) ||
      value < activity.min ||
      value > activity.max
    ) {
      setMessage(
        `Enter a value from ${activity.min} to ${activity.max} ${activity.unit}.`,
      );
      return;
    }
    const occurredAt = new Date(`${date}T${time}:00`);
    const assignmentId =
      !requestedPlanBlock &&
      assignment?.activityDefinitionId === activityId &&
      date >= assignment.startsOn &&
      date <= assignment.dueOn
        ? assignment.id
        : undefined;
    const plan: TrainingPlanProvenance | undefined =
      requestedPlanBlock &&
      planDay &&
      date === planDay.occursOn &&
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
      const input: TrainingEntryInput = draft?.attempt
        ? JSON.parse(draft.attempt.fingerprint)
        : {
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
          };
      const attempt = submissionAttempt(input, draft?.attempt);
      updateDraft({
        attempt,
        selection: { activityId: input.activityId, value: input.value },
        amountText: String(input.value),
      });
      const entry = await addEntry(input, attempt.key);
      draftStore.clear();
      router.push(
        `/?saved=1&entry=${encodeURIComponent(entry.id)}${completesPrimary ? "&completed=1" : ""}`,
      );
    } catch (cause) {
      setMessage(
        !navigator.onLine
          ? copy.recovery.offlineSave
          : cause instanceof TrainingEntryGatewayError
            ? cause.message
            : copy.recovery.saveUnconfirmed,
      );
      setSaving(false);
      window.requestAnimationFrame(() => errorRef.current?.focus());
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

      <form method="post" className="log-form" onSubmit={submit}>
        <WorkoutSelect
          label="Workout"
          selectedKey={activityId}
          placeholder={copy.log.chooseActivity}
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
            {selectedActivity.instructions ? (
              <details className="selected-instructions">
                <summary>{qualityCopy.howTo(selectedActivity.name)}</summary>
                <ol>
                  {selectedActivity.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </details>
            ) : null}
            <p className="log-safety-note">
              {requestedPlanBlock ||
              assignment?.activityDefinitionId === activityId
                ? qualityCopy.target(
                    requestedPlanBlock
                      ? plannedActivityTarget(
                          selectedActivity,
                          requestedPlanBlock,
                        )
                      : assignment?.targetValue,
                    selectedActivity.unit,
                  )
                : ""}
              {qualityCopy.actualAmount}
            </p>
            <ActivitySpecificFields
              activityId={selectedActivity.id}
              value={value}
              inputText={draft?.amountText}
              onInputText={(text) => updateDraft({ amountText: text })}
              onChange={(nextValue) =>
                updateDraft({
                  selection: {
                    activityId: selectedActivity.id,
                    value: nextValue,
                  },
                  amountText: String(nextValue),
                })
              }
              activities={activities}
            />
            <WorkoutOutcomeChoices
              value={completionOutcome}
              onChange={(next) => updateDraft({ completionOutcome: next })}
            />
            <IntensityControls
              effort={effort}
              exhaustion={exhaustion}
              onEffortChange={(next) => updateDraft({ effort: next })}
              onExhaustionChange={(next) => updateDraft({ exhaustion: next })}
            />
            {exhaustion >= 6 ? (
              <aside className="recovery-note">
                <span aria-hidden="true">💧</span>
                <p>{copy.recoveryNote}</p>
              </aside>
            ) : null}
          </>
        ) : null}
        <details className="when-details">
          <summary>
            <span aria-hidden="true">◷</span>
            <strong>
              {clock.ready
                ? `${compactDateLabel(date)} · ${compactTimeLabel(time)}`
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
                value={date}
                onChange={(event) => updateDraft({ date: event.target.value })}
                required
              />
            </label>
            <label htmlFor="session-time">
              Time
              <input
                id="session-time"
                type="time"
                value={time}
                onChange={(event) => updateDraft({ time: event.target.value })}
                required
              />
            </label>
          </div>
        </details>
        {message ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            className="notice notice--error"
            role="alert"
          >
            <strong>{message}</strong>
          </div>
        ) : null}
        <button
          className="button button--lime button--wide"
          type="submit"
          disabled={saving || !clock.ready || !selectedActivity}
        >
          {saving
            ? "Saving…"
            : message
              ? copy.recovery.retrySave
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

        {draft ? (
          <div className="draft-actions">
            <p>{copy.recovery.draftKept}</p>
            <button
              type="button"
              className="text-button"
              disabled={saving}
              onClick={() => {
                draftStore.clear();
                setMessage(null);
              }}
            >
              {copy.recovery.discard}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
