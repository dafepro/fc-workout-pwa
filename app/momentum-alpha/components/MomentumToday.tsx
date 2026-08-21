"use client";

import Link from "next/link";
import { useState } from "react";
import { momentumAlphaCopy } from "../content";
import type { CompletionChoice, Feeling, PlanSelection } from "../model";
import { momentumBand, nextSuggestedWorkload } from "../model";
import { momentumAlphaRoutes } from "../routes";
import { useMomentumAlpha } from "../state";
import { MomentumTrail } from "./MomentumTrail";

type TodayView = "plan" | "alternatives" | "check-in" | "complete";

export function MomentumToday() {
  const { state, presentation, loading } = useMomentumAlpha();
  const [view, setView] = useState<TodayView>("plan");
  const [selection, setSelection] = useState<PlanSelection>("prescribed");

  if (loading) {
    return (
      <main className="ma-page ma-focused-page" aria-busy="true">
        <p>{momentumAlphaCopy.connected.loadingPlan}</p>
      </main>
    );
  }
  if (state.dayKind === "rest") return <RestToday />;
  if (view === "alternatives") {
    return (
      <AlternativeChoice
        onBack={() => setView("plan")}
        onChoose={(nextSelection) => {
          setSelection(nextSelection);
          setView("check-in");
        }}
      />
    );
  }
  if (view === "check-in") {
    return (
      <CheckIn
        selection={selection}
        onBack={() =>
          setView(selection === "prescribed" ? "plan" : "alternatives")
        }
        onComplete={() => setView("complete")}
      />
    );
  }
  if (view === "complete" || state.primaryComplete) return <TrainingComplete />;

  return (
    <div className="ma-page ma-today">
      <MomentumTrail
        kind="personal"
        band={momentumBand(state.personalMomentum)}
      />

      <section className="ma-plan" aria-labelledby="ma-today-title">
        <div className="ma-plan__heading">
          <div>
            <p className="ma-eyebrow">{momentumAlphaCopy.today.eyebrow}</p>
            <h1 id="ma-today-title">{momentumAlphaCopy.today.title}</h1>
          </div>
          <span className="ma-date">{presentation.plan.dateLabel}</span>
        </div>

        <div className="ma-plan__activity">
          <span className="ma-plan__activity-mark" aria-hidden="true">
            ↗
          </span>
          <div>
            <h2>{presentation.plan.activity}</h2>
            <p>{presentation.plan.workload}</p>
          </div>
        </div>

        <p className="ma-plan__instruction">{presentation.plan.instruction}</p>

        <div className="ma-targets">
          <article className="ma-target ma-target--goal">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{presentation.plan.goal}</strong>
              <small>{momentumAlphaCopy.today.goalNote}</small>
            </div>
          </article>
          <article className="ma-target ma-target--stretch">
            <span aria-hidden="true">+</span>
            <div>
              <strong>{presentation.plan.stretch}</strong>
              <small>{momentumAlphaCopy.today.stretchNote}</small>
            </div>
          </article>
        </div>

        <button
          type="button"
          className="ma-button ma-button--primary ma-button--wide"
          onClick={() => {
            setSelection("prescribed");
            setView("check-in");
          }}
        >
          {momentumAlphaCopy.today.checkIn} <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="ma-text-button"
          onClick={() => setView("alternatives")}
        >
          {momentumAlphaCopy.today.alternative}
        </button>

        <details className="ma-why">
          <summary>{momentumAlphaCopy.today.why}</summary>
          <ul>
            {presentation.plan.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

function AlternativeChoice({
  onBack,
  onChoose,
}: {
  onBack(): void;
  onChoose(selection: PlanSelection): void;
}) {
  const { presentation } = useMomentumAlpha();
  return (
    <div className="ma-page ma-focused-page">
      <button type="button" className="ma-back" onClick={onBack}>
        <span aria-hidden="true">←</span>{" "}
        {momentumAlphaCopy.today.alternativeBack}
      </button>
      <section className="ma-choice-card">
        <p className="ma-eyebrow">{momentumAlphaCopy.today.flowEyebrow}</p>
        <h1>{momentumAlphaCopy.today.alternativeTitle}</h1>
        <p>{momentumAlphaCopy.today.alternativeIntro}</p>
        <div className="ma-alternatives">
          {presentation.alternatives.map((alternative) => (
            <button
              key={alternative.id}
              type="button"
              onClick={() => onChoose(alternative.id)}
            >
              <span>
                <strong>{alternative.title}</strong>
                <small>{alternative.detail}</small>
              </span>
              <em>{alternative.effect}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CheckIn({
  selection,
  onBack,
  onComplete,
}: {
  selection: PlanSelection;
  onBack(): void;
  onComplete(): void;
}) {
  const { complete, presentation } = useMomentumAlpha();
  const [choice, setChoice] = useState<CompletionChoice | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const alternative = presentation.alternatives.find(
    (item) => item.id === selection,
  );
  const activity = alternative?.title ?? presentation.plan.activity;
  const goal = alternative?.goal ?? presentation.plan.goal;
  const stretch = alternative?.stretch ?? presentation.plan.stretch;

  return (
    <div className="ma-page ma-focused-page">
      <button type="button" className="ma-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {momentumAlphaCopy.checkIn.back}
      </button>
      <section className="ma-checkin" aria-labelledby="ma-checkin-title">
        <p className="ma-eyebrow">{momentumAlphaCopy.checkIn.eyebrow}</p>
        <h1 id="ma-checkin-title">{momentumAlphaCopy.checkIn.title}</h1>
        <p className="ma-checkin__activity">{activity}</p>

        <div
          className="ma-checkin__choices"
          aria-label={momentumAlphaCopy.checkIn.targetGroup}
        >
          <button
            type="button"
            aria-label={goal}
            className={choice === "goal" ? "is-selected" : ""}
            aria-pressed={choice === "goal"}
            onClick={() => setChoice("goal")}
          >
            <span aria-hidden="true">✓</span>
            <strong>{goal}</strong>
            <small>{momentumAlphaCopy.checkIn.goalNote}</small>
          </button>
          <button
            type="button"
            aria-label={stretch}
            className={choice === "stretch" ? "is-selected" : ""}
            aria-pressed={choice === "stretch"}
            onClick={() => setChoice("stretch")}
          >
            <span aria-hidden="true">+</span>
            <strong>{stretch}</strong>
            <small>{momentumAlphaCopy.checkIn.stretchNote}</small>
          </button>
        </div>

        <fieldset className="ma-feelings">
          <legend>{momentumAlphaCopy.checkIn.feeling}</legend>
          <div>
            {(
              Object.entries(momentumAlphaCopy.checkIn.feelings) as [
                Feeling,
                string,
              ][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={feeling === value ? "is-selected" : ""}
                aria-pressed={feeling === value}
                onClick={() => setFeeling(value)}
              >
                <span aria-hidden="true">
                  {value === "good" ? "●" : value === "tired" ? "◐" : "○"}
                </span>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="ma-private-note">
          <span aria-hidden="true">◇</span> {momentumAlphaCopy.checkIn.privacy}
        </p>
        <button
          type="button"
          className="ma-button ma-button--primary ma-button--wide"
          disabled={!choice || !feeling || saving}
          onClick={() => {
            if (!choice || !feeling) return;
            setSaveError("");
            const result = complete({
              choice,
              feeling,
              planSelection: selection,
            });
            if (!result) {
              onComplete();
              return;
            }
            setSaving(true);
            void result.then(onComplete, () => {
              setSaving(false);
              setSaveError(momentumAlphaCopy.connected.saveFailed);
            });
          }}
        >
          {saving
            ? momentumAlphaCopy.connected.saving
            : momentumAlphaCopy.checkIn.save}
        </button>
        {saveError ? <p role="alert">{saveError}</p> : null}
      </section>
    </div>
  );
}

function TrainingComplete() {
  const { state, presentation, recordRecovery, recordExtra } =
    useMomentumAlpha();
  const [extraSaved, setExtraSaved] = useState(false);
  const effect =
    state.planSelection === "ball-control"
      ? momentumAlphaCopy.complete.partial
      : state.planSelection === "low-impact"
        ? momentumAlphaCopy.complete.equivalent
        : state.primaryChoice === "stretch"
          ? momentumAlphaCopy.complete.prescribedStretch
          : momentumAlphaCopy.complete.prescribedGoal;
  const recoveryRecommended =
    nextSuggestedWorkload(
      state.planSelection === "prescribed" ? "hard" : "moderate",
      state.feeling ?? "good",
    ) === "recovery";

  return (
    <div className="ma-page ma-complete">
      <MomentumTrail
        kind="personal"
        band={momentumBand(state.personalMomentum)}
      />
      <section className="ma-complete__hero">
        <span className="ma-complete__check" aria-hidden="true">
          ✓
        </span>
        <p className="ma-eyebrow">{momentumAlphaCopy.complete.eyebrow}</p>
        <h1>{momentumAlphaCopy.complete.title}</h1>
        <p>{effect}</p>
        <small>{momentumAlphaCopy.complete.team}</small>
      </section>

      {recoveryRecommended ? (
        <section className="ma-recovery" aria-labelledby="ma-recovery-title">
          <div className="ma-recovery__icon" aria-hidden="true">
            ≈
          </div>
          <div>
            <p className="ma-eyebrow">
              {momentumAlphaCopy.complete.recoveryEyebrow}
            </p>
            <h2 id="ma-recovery-title">{presentation.recovery.title}</h2>
            <strong>{presentation.recovery.detail}</strong>
            <p>{momentumAlphaCopy.complete.recoveryBody}</p>
          </div>
          <button
            type="button"
            className="ma-button ma-button--quiet"
            disabled={state.recoveryComplete}
            onClick={() => void recordRecovery()}
          >
            {state.recoveryComplete
              ? momentumAlphaCopy.complete.recoveryLogged
              : momentumAlphaCopy.complete.logRecovery}
          </button>
        </section>
      ) : null}

      <div className="ma-complete__actions">
        <Link
          className="ma-button ma-button--primary"
          href={momentumAlphaRoutes.team}
        >
          {momentumAlphaCopy.complete.seeTeam} <span aria-hidden="true">→</span>
        </Link>
        <Link
          className="ma-button ma-button--ghost"
          href={momentumAlphaRoutes.me}
        >
          {momentumAlphaCopy.complete.finish}
        </Link>
      </div>

      <details className="ma-extra">
        <summary>{momentumAlphaCopy.complete.extraTitle}</summary>
        <p>{momentumAlphaCopy.complete.extraBody}</p>
        <div>
          {presentation.extras.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => {
                const result = recordExtra(activity.id);
                if (result) {
                  void result.then(() => setExtraSaved(true));
                } else {
                  setExtraSaved(true);
                }
              }}
            >
              {activity.label}
            </button>
          ))}
        </div>
        {extraSaved ? (
          <small role="status">{momentumAlphaCopy.complete.extraSaved}</small>
        ) : null}
      </details>
    </div>
  );
}

function RestToday() {
  const { state, recordRest } = useMomentumAlpha();

  if (state.primaryComplete) {
    return (
      <div className="ma-page ma-rest ma-rest--complete">
        <MomentumTrail
          kind="personal"
          band={momentumBand(state.personalMomentum)}
        />
        <section>
          <span className="ma-rest__moon" aria-hidden="true">
            ☾
          </span>
          <p className="ma-eyebrow">{momentumAlphaCopy.rest.completeEyebrow}</p>
          <h1>{momentumAlphaCopy.rest.completeTitle}</h1>
          <p>{momentumAlphaCopy.rest.completeBody}</p>
          <Link
            className="ma-button ma-button--primary"
            href={momentumAlphaRoutes.team}
          >
            {momentumAlphaCopy.rest.seeTeam}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="ma-page ma-rest">
      <MomentumTrail
        kind="personal"
        band={momentumBand(state.personalMomentum)}
      />
      <section>
        <span className="ma-rest__moon" aria-hidden="true">
          ☾
        </span>
        <p className="ma-eyebrow">{momentumAlphaCopy.rest.eyebrow}</p>
        <h1>{momentumAlphaCopy.rest.title}</h1>
        <p>{momentumAlphaCopy.rest.body}</p>
        <p className="ma-private-note">
          <span aria-hidden="true">◇</span> {momentumAlphaCopy.rest.privacy}
        </p>
        <button
          type="button"
          className="ma-button ma-button--primary"
          onClick={() => void recordRest()}
        >
          {momentumAlphaCopy.rest.action}
        </button>
      </section>
    </div>
  );
}
