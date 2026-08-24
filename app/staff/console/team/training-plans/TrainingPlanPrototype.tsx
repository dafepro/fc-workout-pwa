"use client";

import { useState } from "react";
import { ConsoleNotice } from "../../ConsoleChrome";
import { consoleRequest, messageFor } from "../../api";
import { consoleCopy } from "../../copy";
import { useResource } from "../../useResource";
import {
  buildDatedPlan,
  type TrainingPlan,
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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const catalog = templates.data?.templates ?? [];
  const template = catalog.find(({ id }) => id === templateID) ?? catalog[0];
  const schedule = startsOn
    ? template
      ? buildDatedPlan(template, startsOn)
      : []
    : (template?.days ?? []).map((day) => ({
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
      await consoleRequest(`v1/staff/teams/${teamId}/training-plans`, {
        method: "POST",
        body: { templateId: template.id, startsOn },
      });
      setStartsOn("");
      plans.reload();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setBusy(false);
    }
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
              onChange={() => setTemplateID(candidate.id)}
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
      <ol className="training-plan__schedule" aria-label={copy.scheduleLabel}>
        {schedule.map((day) => (
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
          {busy ? copy.publishing : copy.publishAction}
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
                <small>{copy.status[plan.status]}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function formatPlanRange(startsOn: string, endsOn: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${startsOn}T12:00:00Z`))} – ${format.format(new Date(`${endsOn}T12:00:00Z`))}`;
}
