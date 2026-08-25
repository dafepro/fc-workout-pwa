"use client";

import { useState } from "react";
import { WorkoutOutcomeChoices } from "../../components/WorkoutOutcomeChoices";
import { WorkoutNoteField } from "../../components/WorkoutNoteField";
import { FeelTracks } from "../../team-canvas/components/FeelTracks";
import { teamCanvasCopy } from "../../team-canvas/content";
import type { CompletionKind } from "../../team-canvas/model";
import type { MomentumPlanContent } from "../../momentum-alpha/connected";
import { playerExperienceCopy } from "../content";

interface TodayPlanHeroProps {
  source: "coach-plan" | "team-default" | "recommendation";
  restDay: boolean;
  complete: boolean;
  previewOnly: boolean;
  actionUnavailable?: boolean;
  plan: Pick<
    MomentumPlanContent,
    "activity" | "workload" | "goal" | "instruction" | "reasons"
  >;
  onComplete(input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
    note?: string;
  }): Promise<boolean>;
  onRecordRest(): Promise<void>;
}

export function TodayPlanHero({
  source,
  restDay,
  complete,
  previewOnly,
  actionUnavailable = false,
  plan,
  onComplete,
  onRecordRest,
}: TodayPlanHeroProps) {
  const copy = playerExperienceCopy.focusedToday;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const activity = restDay ? "Planned recovery day" : plan.activity;
  const workload = restDay ? "Recovery day" : plan.workload;
  const goal = restDay ? copy.restGoal : plan.goal;
  const instruction = restDay ? copy.restInstruction : plan.instruction;

  async function saveWorkout() {
    setPending(true);
    setError("");
    try {
      const saved = await onComplete({
        completion,
        effort,
        tiredness,
        note: note.trim() || undefined,
      });
      if (saved) setCheckInOpen(false);
      else setError(copy.saveError);
    } catch {
      setError(copy.saveError);
    } finally {
      setPending(false);
    }
  }

  async function saveRest() {
    setPending(true);
    setError("");
    try {
      await onRecordRest();
      setCheckInOpen(false);
    } catch {
      setError(copy.actionError);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`today-plan-hero${complete ? " today-plan-hero--complete" : ""}${restDay ? " today-plan-hero--rest" : ""}`}
      aria-labelledby="today-plan-title"
    >
      <header className="today-plan-hero__header">
        <div>
          <span className="today-plan-hero__today">{copy.today}</span>
          <small>
            {source === "coach-plan"
              ? copy.coachPlan
              : source === "team-default"
                ? copy.teamDefault
                : copy.recommended}
          </small>
        </div>
        {complete ? (
          <span className="today-plan-hero__complete-mark" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </header>

      {complete ? (
        <div className="today-plan-hero__closure">
          <p>{copy.todayComplete}</p>
          <h1 id="today-plan-title">{activity}</h1>
          <p>
            {restDay ? copy.recoveryCompleteBody : copy.workoutCompleteBody}
          </p>
        </div>
      ) : (
        <>
          <h1 id="today-plan-title">{activity}</h1>
          {source === "recommendation" ? (
            <p className="today-plan-hero__fallback">
              {copy.recommendationFallback}
            </p>
          ) : null}
          <div className="today-plan-hero__metadata">
            <span>{workload}</span>
            {restDay ? <span>{copy.restPurpose}</span> : null}
          </div>
          <p className="today-plan-hero__goal">{goal}</p>
        </>
      )}

      <button
        className="today-plan-hero__details-toggle"
        type="button"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {detailsOpen ? copy.hideDetails : copy.details}
        <span aria-hidden="true">{detailsOpen ? "⌃" : "⌄"}</span>
      </button>

      {detailsOpen ? (
        <div className="today-plan-hero__details">
          <p>{instruction}</p>
          {plan.reasons.length > 0 ? (
            <ul>
              {plan.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!complete && actionUnavailable ? (
        <p className="today-plan-hero__error" role="alert">
          {copy.activityUnavailable}
        </p>
      ) : null}

      {!complete && !actionUnavailable && !checkInOpen ? (
        <button
          className="today-plan-hero__primary"
          type="button"
          onClick={() => setCheckInOpen(true)}
        >
          {restDay ? copy.startRecovery : copy.startWorkout}
        </button>
      ) : null}

      {!complete && checkInOpen ? (
        <div className="today-plan-hero__check-in">
          {restDay ? (
            <p>
              Confirm when you have checked in for today’s planned recovery.
            </p>
          ) : (
            <>
              <WorkoutOutcomeChoices
                className="today-checkin__targets"
                value={completion}
                onChange={setCompletion}
              />
              <FeelTracks
                effort={effort}
                tiredness={tiredness}
                onEffortChange={setEffort}
                onTirednessChange={setTiredness}
              />
              <WorkoutNoteField value={note} onChange={setNote} />
            </>
          )}
          <div className="today-plan-hero__check-in-actions">
            <button type="button" onClick={() => setCheckInOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={previewOnly || pending}
              onClick={() => void (restDay ? saveRest() : saveWorkout())}
            >
              {previewOnly
                ? "Preview only"
                : pending
                  ? "Saving…"
                  : restDay
                    ? copy.confirmRecovery
                    : teamCanvasCopy.today.save}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="today-plan-hero__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
