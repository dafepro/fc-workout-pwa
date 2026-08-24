"use client";

import Link from "next/link";
import { useState } from "react";
import type { MomentumPresentation } from "../../momentum-alpha/connected";
import { FeelTracks } from "../../team-canvas/components/FeelTracks";
import { teamCanvasCopy } from "../../team-canvas/content";
import type { CompletionKind } from "../../team-canvas/model";
import { playerExperienceCopy } from "../content";
import {
  decideWhatsNext,
  type WhatsNextSecondaryAction,
} from "../whats-next-model";

interface WhatsNextProps {
  restDay: boolean;
  planComplete: boolean;
  cooldownComplete: boolean;
  teamAvailable?: boolean;
  previewOnly: boolean;
  recentEffort?: number | null;
  recentTiredness?: number | null;
  connectedError: string | null;
  plan: MomentumPresentation["plan"];
  recovery: MomentumPresentation["recovery"];
  onComplete(input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
  }): Promise<boolean>;
  onRecordRest(): Promise<void>;
  onRecordCooldown(): Promise<void>;
}

export function WhatsNext({
  restDay,
  planComplete,
  cooldownComplete,
  teamAvailable = true,
  previewOnly,
  recentEffort,
  recentTiredness,
  connectedError,
  plan,
  recovery,
  onComplete,
  onRecordRest,
  onRecordCooldown,
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
        previewOnly={previewOnly}
        recentEffort={recentEffort}
        recentTiredness={recentTiredness}
        recovery={recovery}
        pending={pending}
        error={connectedError ?? actionError}
        onRecordCooldown={() => runAction("cooldown", () => onRecordCooldown())}
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
  previewOnly,
  recentEffort,
  recentTiredness,
  recovery,
  pending,
  error,
  onRecordCooldown,
}: {
  restDay: boolean;
  cooldownComplete: boolean;
  teamAvailable: boolean;
  previewOnly: boolean;
  recentEffort?: number | null;
  recentTiredness?: number | null;
  recovery: MomentumPresentation["recovery"];
  pending: string | null;
  error: string;
  onRecordCooldown(): Promise<void>;
}) {
  const copy = playerExperienceCopy.whatsNext;
  const [reviewingCooldown, setReviewingCooldown] = useState(false);
  const decision = decideWhatsNext({
    restDay,
    planComplete: true,
    cooldownComplete,
    teamAvailable,
    effort: recentEffort,
    tiredness: recentTiredness,
  });

  async function confirmCooldown() {
    await onRecordCooldown();
    setReviewingCooldown(false);
  }

  const recommendation = recommendationContent(
    decision.recommendation,
    recovery,
  );

  return (
    <section
      className={`whats-next whats-next--complete whats-next--${decision.recommendation}`}
      aria-labelledby="whats-next-complete-title"
    >
      <header className="whats-next__complete-heading">
        <span aria-hidden="true">✓</span>
        <div>
          <p className="player-eyebrow">{copy.planFollowed}</p>
          <h1 id="whats-next-complete-title">{copy.completeTitle}</h1>
          <p>{restDay ? copy.restLogged : copy.workoutLogged}</p>
        </div>
      </header>

      {decision.showCooldownStatus ? (
        <p className="whats-next__status">
          <span aria-hidden="true">✓</span>
          <span>
            <strong>{copy.cooldownLogged}</strong>
            <small>{copy.cooldownDetail}</small>
          </span>
        </p>
      ) : null}

      <div className="whats-next__recommendation">
        <div className="whats-next__recommendation-icon" aria-hidden="true">
          {recommendation.icon}
        </div>
        <div className="whats-next__recommendation-copy">
          <p className="player-eyebrow">{copy.recommended}</p>
          <h2>{recommendation.title}</h2>
          <p>{recommendation.detail}</p>
        </div>

        {decision.recommendation === "cooldown" ? (
          <button
            type="button"
            className="whats-next__primary-action"
            disabled={previewOnly || pending !== null}
            onClick={() => setReviewingCooldown(true)}
          >
            {previewOnly
              ? copy.previewAction
              : copy.reviewCooldown(recovery.title)}
            <span aria-hidden="true">›</span>
          </button>
        ) : null}

        {decision.recommendation === "lounge" && !previewOnly ? (
          <Link className="whats-next__primary-action" href="/team">
            {copy.openLounge}
            <span aria-hidden="true">›</span>
          </Link>
        ) : null}

        {decision.recommendation === "lounge" && previewOnly ? (
          <p className="whats-next__preview-action">{copy.previewAction}</p>
        ) : null}
      </div>

      {reviewingCooldown ? (
        <div
          className="whats-next__review"
          role="region"
          aria-labelledby="cooldown-review-title"
        >
          <div>
            <p className="player-eyebrow">{copy.cooldownReviewTitle}</p>
            <h3 id="cooldown-review-title">{recovery.title}</h3>
            <p>{recovery.detail}</p>
            <small>{copy.cooldownReviewBody}</small>
          </div>
          <div className="whats-next__review-actions">
            <button
              type="button"
              onClick={() => setReviewingCooldown(false)}
              disabled={pending !== null}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => void confirmCooldown()}
              disabled={previewOnly || pending !== null}
            >
              {pending === "cooldown"
                ? copy.saving
                : copy.recordCooldown(recovery.title)}
            </button>
          </div>
        </div>
      ) : null}

      {decision.secondary.length > 0 || decision.showTeamLocked ? (
        <div className="whats-next__secondary">
          <p>{copy.otherOptions}</p>
          <div>
            {decision.secondary.map((action) => (
              <SecondaryAction
                key={action}
                action={action}
                previewOnly={previewOnly}
              />
            ))}
            {decision.showTeamLocked ? (
              <div className="whats-next__secondary-status">
                <span className="whats-next__action-icon" aria-hidden="true">
                  ◇
                </span>
                <span>
                  <strong>{copy.teamLocked}</strong>
                  <small>{copy.teamLockedDetail}</small>
                </span>
                <span className="whats-next__action-state">
                  {copy.lockedLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewOnly ? (
        <p className="whats-next__preview-notice">{copy.previewNotice}</p>
      ) : null}
      <footer className="whats-next__footer">
        <span aria-hidden="true">✓</span>
        <p>{restDay ? copy.restFooter : copy.optionalFooter}</p>
      </footer>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function SecondaryAction({
  action,
  previewOnly,
}: {
  action: WhatsNextSecondaryAction;
  previewOnly: boolean;
}) {
  const copy = playerExperienceCopy.whatsNext;
  const isLounge = action === "lounge";
  const title = isLounge ? copy.openLounge : copy.logAnother;
  const detail = isLounge ? copy.loungeDetail : copy.logAnotherDetail;
  const icon = isLounge ? "⚽" : "+";
  const href = isLounge ? "/team" : "/log/additional";

  if (previewOnly) {
    return (
      <div className="whats-next__secondary-status">
        <span className="whats-next__action-icon" aria-hidden="true">
          {icon}
        </span>
        <span>
          <strong>{title}</strong>
          <small>{copy.previewAction}</small>
        </span>
        <span className="whats-next__action-state">{copy.previewLabel}</span>
      </div>
    );
  }

  return (
    <Link className="whats-next__secondary-action" href={href}>
      <span className="whats-next__action-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="whats-next__action-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function recommendationContent(
  recommendation: ReturnType<typeof decideWhatsNext>["recommendation"],
  recovery: MomentumPresentation["recovery"],
) {
  const copy = playerExperienceCopy.whatsNext;
  switch (recommendation) {
    case "cooldown":
      return {
        icon: "↘",
        title: recovery.title,
        detail: recovery.detail,
      };
    case "recovery":
      return {
        icon: "≈",
        title: copy.recoveryTitle,
        detail: copy.recoveryDetail,
      };
    case "lounge":
      return {
        icon: "⚽",
        title: copy.lounge,
        detail: copy.loungeDetail,
      };
    case "all-set":
      return {
        icon: "✓",
        title: copy.allSetTitle,
        detail: copy.allSetDetail,
      };
  }
}
