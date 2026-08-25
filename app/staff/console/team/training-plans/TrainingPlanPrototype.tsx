"use client";

import { useState } from "react";
import { ConsoleNotice } from "../../ConsoleChrome";
import { ConsoleError, consoleRequest, messageFor } from "../../api";
import { consoleCopy } from "../../copy";
import { useResource } from "../../useResource";
import {
  buildDatedPlan,
  editablePlanDays,
  type TrainingPlan,
  type TrainingPlanDay,
  type TrainingPlanTemplate,
} from "./model";

export function TrainingPlanPrototype({ teamId }: { teamId: string }) {
  const copy = consoleCopy.trainingPlans;
  const templates = useResource<{ templates: TrainingPlanTemplate[] }>(
    "v1/staff/training-plan-templates",
  );
  const plans = useResource<{ plans: TrainingPlan[] }>(
    `v1/staff/teams/${teamId}/training-plans`,
  );
  const [templateID, setTemplateID] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [draftDays, setDraftDays] = useState<TrainingPlanDay[]>([]);
  const [editingPlanID, setEditingPlanID] = useState("");
  const [confirmCancelID, setConfirmCancelID] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const catalog = templates.data?.templates ?? [];
  const template = catalog.find(({ id }) => id === templateID) ?? catalog[0];
  const planDays = draftDays.length > 0 ? draftDays : (template?.days ?? []);
  const activityChoices = Array.from(
    new Map(
      catalog.flatMap((item) =>
        item.days.flatMap((day) =>
          (day.blocks ?? []).map((block) => [
            block.activityDefinitionId,
            block,
          ]),
        ),
      ),
    ).values(),
  );
  const schedule = startsOn
    ? template
      ? buildDatedPlan({ ...template, days: planDays }, startsOn)
      : []
    : planDays.map((day) => ({
        ...day,
        date: "",
        dayLabel: copy.day(day.offset + 1),
      }));

  if (templates.loading && !templates.data) return <p>{copy.loading}</p>;
  if (!templates.data || !template) {
    return (
      <ConsoleNotice message={templates.error || copy.catalogLoadFailed} />
    );
  }

  async function publish() {
    if (!template || !startsOn || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const path = editingPlanID
        ? `v1/staff/teams/${teamId}/training-plans/${editingPlanID}/reschedule`
        : `v1/staff/teams/${teamId}/training-plans`;
      await consoleRequest(path, {
        method: "POST",
        body: { templateId: template.id, startsOn, days: planDays },
      });
      setStartsOn("");
      setDraftDays([]);
      setEditingPlanID("");
      plans.reload();
    } catch (error) {
      setActionError(messageFor(error));
      reconcileChangedPlan(error);
    } finally {
      setBusy(false);
    }
  }

  function chooseTemplate(candidate: TrainingPlanTemplate) {
    setTemplateID(candidate.id);
    setDraftDays(editablePlanDays(candidate.days));
    setEditingPlanID("");
  }

  function updateDay(index: number, update: Partial<TrainingPlanDay>) {
    setDraftDays((current) => {
      const source =
        current.length > 0 ? current : editablePlanDays(template.days);
      return source.map((day, dayIndex) =>
        dayIndex === index ? normalizeEditedDay({ ...day, ...update }) : day,
      );
    });
  }

  function beginReschedule(plan: TrainingPlan) {
    setTemplateID(plan.templateId);
    setDraftDays(editablePlanDays(plan.days));
    setStartsOn(plan.startsOn);
    setEditingPlanID(plan.id);
    setActionError("");
  }

  async function cancelPlan(planID: string) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await consoleRequest(
        `v1/staff/teams/${teamId}/training-plans/${planID}/cancel`,
        { method: "POST" },
      );
      setConfirmCancelID("");
      plans.reload();
    } catch (error) {
      setActionError(messageFor(error));
      reconcileChangedPlan(error);
    } finally {
      setBusy(false);
    }
  }

  function reconcileChangedPlan(error: unknown) {
    if (
      !(error instanceof ConsoleError) ||
      error.code !== "training_plan_changed"
    ) {
      return;
    }
    setStartsOn("");
    setDraftDays([]);
    setEditingPlanID("");
    setConfirmCancelID("");
    plans.reload();
  }

  return (
    <section
      className="console-card training-plan"
      aria-label={copy.regionLabel}
    >
      <header className="training-plan__heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 className="console-card__title">{copy.title}</h2>
        </div>
        <span>{copy.scope}</span>
      </header>
      <p className="console-hint">{copy.intro}</p>
      {actionError ? <ConsoleNotice message={actionError} /> : null}

      <fieldset className="training-plan__templates">
        <legend>{copy.choose}</legend>
        {catalog.map((candidate) => (
          <label key={candidate.id}>
            <input
              type="radio"
              name="training-plan-template"
              value={candidate.id}
              checked={candidate.id === template.id}
              onChange={() => chooseTemplate(candidate)}
            />
            <span>
              <strong>{candidate.name}</strong>
              <small>{candidate.summary}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="training-plan__start" htmlFor="training-plan-start">
        {copy.startsOn}
        <input
          id="training-plan-start"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
        />
      </label>

      <div className="training-plan__summary">
        <h3>{template.name}</h3>
        <p>{template.summary}</p>
      </div>
      {editingPlanID ? (
        <p className="training-plan__policy">{copy.editReplacement}</p>
      ) : null}
      <ol className="training-plan__schedule" aria-label={copy.scheduleLabel}>
        {schedule.map((day, index) => (
          <li key={day.offset} className={`is-${day.kind}`}>
            <span className="training-plan__date">{day.dayLabel}</span>
            <div>
              <strong>{copy.kind[day.kind]}</strong>
              <span>
                {copy.focus[day.focus]}
                {day.durationMinutes > 0
                  ? ` · ${day.durationMinutes} min · ${copy.intensity[day.intensity]}`
                  : ""}
              </span>
            </div>
            {(day.blocks ?? []).length > 0 ? (
              <small>
                {(day.blocks ?? []).map(({ label }) => label).join(" + ")}
              </small>
            ) : (
              <small>{copy.noWorkout}</small>
            )}
            <details className="training-plan__editor">
              <summary>{copy.customize}</summary>
              <p>{copy.customizeHint}</p>
              <div>
                <label>
                  {copy.dayType}
                  <select
                    aria-label={`${day.dayLabel} ${copy.dayType}`}
                    value={day.kind}
                    onChange={(event) =>
                      updateDay(index, {
                        kind: event.target.value as TrainingPlanDay["kind"],
                      })
                    }
                  >
                    <option value="training">{copy.kind.training}</option>
                    <option value="recovery">{copy.kind.recovery}</option>
                    <option value="rest">{copy.kind.rest}</option>
                  </select>
                </label>
                {day.kind === "training" ? (
                  <>
                    <label>
                      {copy.focus[day.focus]}
                      <select
                        aria-label={`${day.dayLabel} Focus`}
                        value={day.focus}
                        onChange={(event) =>
                          updateDay(index, {
                            focus: event.target
                              .value as TrainingPlanDay["focus"],
                          })
                        }
                      >
                        <option value="speed">{copy.focus.speed}</option>
                        <option value="endurance">
                          {copy.focus.endurance}
                        </option>
                        <option value="recovery">{copy.focus.recovery}</option>
                      </select>
                    </label>
                    <label>
                      {copy.duration}
                      <input
                        aria-label={`${day.dayLabel} ${copy.duration}`}
                        type="number"
                        min="5"
                        max="20"
                        step="5"
                        value={day.durationMinutes}
                        onChange={(event) =>
                          updateDay(index, {
                            durationMinutes: Number(event.target.value),
                            blocks: day.blocks.map((block) => ({
                              ...block,
                              durationMinutes: Number(event.target.value),
                            })),
                          })
                        }
                      />
                    </label>
                    <label>
                      {copy.intensity[day.intensity]}
                      <select
                        aria-label={`${day.dayLabel} Intensity`}
                        value={day.intensity}
                        onChange={(event) =>
                          updateDay(index, {
                            intensity: event.target
                              .value as TrainingPlanDay["intensity"],
                          })
                        }
                      >
                        <option value="easy">{copy.intensity.easy}</option>
                        <option value="steady">{copy.intensity.steady}</option>
                        <option value="hard">{copy.intensity.hard}</option>
                      </select>
                    </label>
                    <label>
                      {copy.activity}
                      <select
                        aria-label={`${day.dayLabel} ${copy.activity}`}
                        value={day.blocks[0]?.activityDefinitionId ?? ""}
                        onChange={(event) => {
                          const block = activityChoices.find(
                            (choice) =>
                              choice.activityDefinitionId ===
                              event.target.value,
                          );
                          if (block)
                            updateDay(index, {
                              blocks: [
                                {
                                  ...block,
                                  durationMinutes: day.durationMinutes,
                                },
                              ],
                            });
                        }}
                      >
                        {activityChoices.map((choice) => (
                          <option
                            key={choice.activityDefinitionId}
                            value={choice.activityDefinitionId}
                          >
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : day.kind === "recovery" ? (
                  <small>
                    15 min · {copy.intensity.easy} · Recovery walk or jog
                  </small>
                ) : (
                  <small>{copy.noWorkout}</small>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>

      <p className="training-plan__policy">{copy.missedDays}</p>
      <p className="console-hint">{copy.contentReview}</p>
      <div className="console-actions training-plan__actions">
        <button
          type="button"
          className="button button--lime"
          disabled={!startsOn || busy}
          onClick={() => void publish()}
        >
          {busy
            ? copy.publishing
            : editingPlanID
              ? copy.reschedulingAction
              : copy.publishAction}
        </button>
      </div>

      {plans.loading && !plans.data ? <p>{copy.loadingHistory}</p> : null}
      {plans.error && !plans.data ? (
        <ConsoleNotice message={plans.error} />
      ) : null}
      {plans.data?.plans.length ? (
        <section
          className="training-plan__history"
          aria-label={copy.historyTitle}
        >
          <h3>{copy.historyTitle}</h3>
          <ul>
            {plans.data.plans.map((plan) => (
              <li key={plan.id}>
                <span>
                  <strong>{plan.templateName}</strong>
                  <small>{formatPlanRange(plan.startsOn, plan.endsOn)}</small>
                </span>
                <span className="training-plan__history-actions">
                  <small>
                    {plan.replacedByPlanId
                      ? copy.replaced
                      : plan.replacesPlanId
                        ? copy.replaces
                        : planStatusLabel(plan, copy.status)}
                  </small>
                  {plan.status === "published" ? (
                    <>
                      {plan.startsOn > calendarToday() ? (
                        <button
                          type="button"
                          onClick={() => beginReschedule(plan)}
                        >
                          {copy.rescheduleAction}
                        </button>
                      ) : null}
                      {confirmCancelID === plan.id ? (
                        <span>
                          <small>{copy.cancelQuestion}</small>
                          <button
                            type="button"
                            onClick={() => void cancelPlan(plan.id)}
                          >
                            {copy.confirmCancel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelID("")}
                          >
                            {copy.keepPlan}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelID(plan.id)}
                        >
                          {copy.cancelAction}
                        </button>
                      )}
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function normalizeEditedDay(day: TrainingPlanDay): TrainingPlanDay {
  if (day.kind === "rest") {
    return {
      ...day,
      focus: "recovery",
      intensity: "easy",
      durationMinutes: 0,
      blocks: [],
    };
  }
  if (day.kind === "recovery") {
    return {
      ...day,
      focus: "recovery",
      intensity: "easy",
      durationMinutes: 15,
      blocks: [
        {
          activityDefinitionId: "recovery-walk-jog",
          label: "Recovery walk or jog",
          durationMinutes: 15,
        },
      ],
    };
  }
  const duration = day.durationMinutes > 0 ? day.durationMinutes : 15;
  return {
    ...day,
    durationMinutes: duration,
    blocks:
      day.blocks.length > 0
        ? day.blocks.map((block) => ({ ...block, durationMinutes: duration }))
        : [
            {
              activityDefinitionId: "timed-run-walk",
              label: "Timed run or walk",
              durationMinutes: duration,
            },
          ],
  };
}

function calendarToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function planStatusLabel(
  plan: TrainingPlan,
  labels: {
    published: string;
    cancelled: string;
    active: string;
    upcoming: string;
    completed: string;
  },
): string {
  if (plan.status === "cancelled") return labels.cancelled;
  const today = calendarToday();
  if (plan.startsOn > today) return labels.upcoming;
  if (plan.endsOn < today) return labels.completed;
  return labels.active;
}

function formatPlanRange(startsOn: string, endsOn: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${startsOn}T12:00:00Z`))} – ${format.format(new Date(`${endsOn}T12:00:00Z`))}`;
}
