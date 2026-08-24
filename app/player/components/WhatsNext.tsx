"use client";

import Link from "next/link";
import { useState } from "react";
import type { MomentumPresentation } from "../../momentum-alpha/connected";
import type { ExtraActivity } from "../../momentum-alpha/model";
import { FeelTracks } from "../../team-canvas/components/FeelTracks";
import { teamCanvasCopy } from "../../team-canvas/content";
import type { CompletionKind } from "../../team-canvas/model";
import { playerExperienceCopy } from "../content";

interface WhatsNextProps {
  restDay: boolean;
  planComplete: boolean;
  cooldownComplete: boolean;
  teamAvailable?: boolean;
  previewOnly: boolean;
  connectedError: string | null;
  plan: MomentumPresentation["plan"];
  recovery: MomentumPresentation["recovery"];
  extras: MomentumPresentation["extras"];
  onComplete(input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
  }): Promise<boolean>;
  onRecordRest(): Promise<void>;
  onRecordCooldown(): Promise<void>;
  onRecordExtra(activity: ExtraActivity): void | Promise<void>;
}

export function WhatsNext({
  restDay,
  planComplete,
  cooldownComplete,
  teamAvailable = true,
  previewOnly,
  connectedError,
  plan,
  recovery,
  extras,
  onComplete,
  onRecordRest,
  onRecordCooldown,
  onRecordExtra,
}: WhatsNextProps) {
  const [expanded, setExpanded] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const copy = playerExperienceCopy.whatsNext;

  async function saveWorkout() {
    setPending("workout");
    setActionError("");
    try {
      const saved = await onComplete({ completion, effort, tiredness });
      if (saved) setExpanded(false);
      else setActionError(copy.saveError);
    } catch {
      setActionError(copy.saveError);
    } finally {
      setPending(null);
    }
  }

  async function runAction(key: string, action: () => void | Promise<void>) {
    setPending(key);
    setActionError("");
    try {
      await action();
    } catch {
      setActionError(copy.actionError);
    } finally {
      setPending(null);
    }
  }

  if (planComplete) {
    return (
      <CompletedNext
        restDay={restDay}
        cooldownComplete={cooldownComplete}
        teamAvailable={teamAvailable}
        recovery={recovery}
        extra={extras[0]}
        pending={pending}
        error={connectedError ?? actionError}
        onRecordCooldown={() => runAction("cooldown", () => onRecordCooldown())}
        onRecordExtra={(activity) =>
          runAction("extra", () => onRecordExtra(activity))
        }
      />
    );
  }

  if (restDay) {
    return (
      <section className="whats-next whats-next--rest">
        <p className="player-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.restTitle}</h1>
        <p>{copy.restDetail}</p>
        <button
          type="button"
          disabled={previewOnly || pending !== null}
          onClick={() => runAction("rest", () => onRecordRest())}
        >
          {previewOnly
            ? copy.previewOnly
            : pending === "rest"
              ? copy.saving
              : copy.recordRest}
        </button>
        {connectedError || actionError ? (
          <p role="alert">{connectedError ?? actionError}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="whats-next whats-next--plan"
      aria-labelledby="whats-next-plan-title"
    >
      <span
        className="whats-next__mark"
        data-testid="workout-mark"
        aria-hidden="true"
      >
        ↗
      </span>
      <div className="whats-next__heading">
        <div>
          <p className="player-eyebrow">{copy.eyebrow}</p>
          <h1 id="whats-next-plan-title">{plan.activity}</h1>
        </div>
        <span>{plan.workload}</span>
      </div>
      <p className="whats-next__goal">{plan.goal}</p>
      <p className="whats-next__instruction">{plan.instruction}</p>

      {expanded ? (
        <div className="today-checkin">
          <div
            className="today-checkin__targets"
            role="group"
            aria-label={teamCanvasCopy.today.formTitle}
          >
            <button
              type="button"
              aria-pressed={completion === "goal"}
              onClick={() => setCompletion("goal")}
            >
              {teamCanvasCopy.today.goal}
            </button>
            <button
              type="button"
              aria-pressed={completion === "reach"}
              onClick={() => setCompletion("reach")}
            >
              {teamCanvasCopy.today.reach}
            </button>
          </div>
          <button
            className="today-checkin__alternative"
            type="button"
            aria-pressed={completion === "approved-alternative"}
            onClick={() => setCompletion("approved-alternative")}
          >
            {teamCanvasCopy.today.alternative}
          </button>
          <FeelTracks
            effort={effort}
            tiredness={tiredness}
            onEffortChange={setEffort}
            onTirednessChange={setTiredness}
          />
          <div className="today-checkin__actions">
            <button
              type="button"
              className="today-checkin__cancel"
              onClick={() => setExpanded(false)}
            >
              {copy.notYet}
            </button>
            <button
              type="button"
              className="today-checkin__save"
              disabled={previewOnly || pending !== null}
              onClick={() => void saveWorkout()}
            >
              {previewOnly
                ? copy.previewOnly
                : pending === "workout"
                  ? copy.saving
                  : teamCanvasCopy.today.save}
            </button>
          </div>
          {connectedError || actionError ? (
            <p role="alert">{connectedError ?? actionError}</p>
          ) : null}
        </div>
      ) : (
        <button
          className="whats-next__log"
          type="button"
          aria-label={copy.logPlan}
          onClick={() => setExpanded(true)}
        >
          <strong>{copy.logPlan}</strong>
          <small>{playerExperienceCopy.today.logPreview}</small>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <details className="whats-next__why">
        <summary>{playerExperienceCopy.today.why}</summary>
        <ul>
          {plan.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function CompletedNext({
  restDay,
  cooldownComplete,
  teamAvailable,
  recovery,
  extra,
  pending,
  error,
  onRecordCooldown,
  onRecordExtra,
}: {
  restDay: boolean;
  cooldownComplete: boolean;
  teamAvailable: boolean;
  recovery: MomentumPresentation["recovery"];
  extra?: MomentumPresentation["extras"][number];
  pending: string | null;
  error: string;
  onRecordCooldown(): void;
  onRecordExtra(activity: ExtraActivity): void;
}) {
  const copy = playerExperienceCopy.whatsNext;
  const loungeRecommended = restDay || cooldownComplete;

  return (
    <section
      className={`whats-next whats-next--complete whats-next--${loungeRecommended ? "lounge" : "cooldown"}`}
    >
      <header className="whats-next__complete-heading">
        <span aria-hidden="true">✓</span>
        <div>
          <p className="player-eyebrow">{copy.planFollowed}</p>
          <h1>{copy.completeTitle}</h1>
          <p>{restDay ? copy.restLogged : copy.workoutLogged}</p>
        </div>
      </header>

      <div className="whats-next__tiles">
        {!restDay && !cooldownComplete ? (
          <button
            type="button"
            className="next-tile next-tile--cooldown is-recommended"
            disabled={pending !== null}
            aria-label={`Log ${recovery.title}`}
            onClick={onRecordCooldown}
          >
            <small>{copy.recommended}</small>
            <strong>{recovery.title}</strong>
            <span>{recovery.detail}</span>
          </button>
        ) : null}

        {teamAvailable ? (
          <Link
            className={`next-tile next-tile--lounge${loungeRecommended ? " is-recommended" : ""}`}
            href="/team"
            data-recommended={loungeRecommended ? "true" : undefined}
          >
            {loungeRecommended ? <small>{copy.recommended}</small> : null}
            <strong>{copy.lounge}</strong>
            <span>{copy.loungeDetail}</span>
          </Link>
        ) : (
          <div
            className="next-tile next-tile--locked"
            aria-label={copy.teamLocked}
          >
            <strong>{copy.teamLocked}</strong>
            <span>{copy.teamLockedDetail}</span>
          </div>
        )}

        {!restDay && cooldownComplete ? (
          <div className="next-tile next-tile--done">
            <strong>{copy.cooldownLogged}</strong>
            <span>{copy.cooldownDetail}</span>
          </div>
        ) : null}

        {!restDay && extra ? (
          <button
            type="button"
            className="next-tile next-tile--extra"
            disabled={pending !== null}
            aria-label={`${copy.logIfDone} ${extra.label}`}
            onClick={() => onRecordExtra(extra.id)}
          >
            <strong>{copy.logIfDone}</strong>
            <span>{extra.label}</span>
          </button>
        ) : (
          <div className="next-tile next-tile--recovery">
            <strong>{copy.keepRecoveryEasy}</strong>
            <span>{copy.keepRecoveryDetail}</span>
          </div>
        )}

        <div className="next-tile next-tile--stop">
          <strong>{copy.callItADay}</strong>
          <span>{copy.callItADayDetail}</span>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
