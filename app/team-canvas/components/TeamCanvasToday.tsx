"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FeelTracks } from "./FeelTracks";
import { teamCanvasCopy } from "../content";
import type { CompletionKind } from "../model";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";

export function TeamCanvasToday() {
  const router = useRouter();
  const {
    state,
    connectedStatus,
    connectedProjection,
    connectedError,
    justCompletedPrimary,
    complete,
    recordRest,
    recordCooldown,
  } = useTeamCanvas();
  const [expanded, setExpanded] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const copy = teamCanvasCopy.today;

  const cooldownPending =
    connectedStatus === "ready"
      ? justCompletedPrimary && !connectedProjection?.cooldownComplete
      : state.primaryComplete &&
        state.dayKind === "training" &&
        !state.cooldownComplete;

  useEffect(() => {
    const returningToCompletedDay =
      connectedStatus === "ready" && !justCompletedPrimary;
    if (
      returningToCompletedDay ||
      (state.primaryComplete && !cooldownPending)
    ) {
      router.replace(teamCanvasRoutes.team);
    }
  }, [
    connectedStatus,
    cooldownPending,
    justCompletedPrimary,
    router,
    state.primaryComplete,
  ]);

  if (connectedStatus === "loading") {
    return <p className="tc-opening">Opening today’s plan…</p>;
  }

  if (cooldownPending) {
    return (
      <div className="tc-today">
        <article className="tc-daily-card tc-cooldown-card">
          <p className="tc-eyebrow">{copy.cooldownEyebrow}</p>
          <h1>{copy.cooldownTitle}</h1>
          <p className="tc-context">{copy.cooldownContext}</p>
          <p className="tc-description">{copy.cooldownDescription}</p>
          <button
            className="tc-plus"
            type="button"
            aria-label={copy.cooldownAction}
            onClick={() => {
              const saved = recordCooldown();
              if (connectedStatus === "local") {
                router.push(teamCanvasRoutes.team);
              } else {
                void saved.then(() => router.push(teamCanvasRoutes.team));
              }
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
          <Link className="tc-join-team" href={teamCanvasRoutes.team}>
            {copy.joinTeam}
          </Link>
        </article>
      </div>
    );
  }

  if (state.primaryComplete) {
    return <p className="tc-opening">Opening your team canvas…</p>;
  }

  if (state.dayKind === "rest") {
    return (
      <div className="tc-today">
        <article className="tc-daily-card tc-daily-card--rest">
          <p className="tc-eyebrow">{copy.restEyebrow}</p>
          <h1>{copy.restTitle}</h1>
          <p className="tc-description">{copy.restDescription}</p>
          <button
            className="tc-plus"
            type="button"
            aria-label={copy.restAction}
            onClick={() => {
              const saved = recordRest();
              if (connectedStatus === "local") {
                router.push(teamCanvasRoutes.team);
              } else {
                void saved.then(() => router.push(teamCanvasRoutes.team));
              }
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
        </article>
      </div>
    );
  }

  return (
    <div className="tc-today">
      <article className={`tc-daily-card${expanded ? " is-expanded" : ""}`}>
        <p className="tc-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.trainingTitle}</h1>
        <p className="tc-context">{copy.trainingContext}</p>
        <p className="tc-description">{copy.trainingDescription}</p>

        {expanded ? (
          <div className="tc-checkin">
            <h2>{copy.formTitle}</h2>
            <div
              className="tc-targets"
              role="group"
              aria-label={copy.formTitle}
            >
              <button
                type="button"
                aria-pressed={completion === "goal"}
                onClick={() => setCompletion("goal")}
              >
                {copy.goal}
              </button>
              <button
                type="button"
                aria-pressed={completion === "reach"}
                onClick={() => setCompletion("reach")}
              >
                {copy.reach}
              </button>
            </div>
            <button
              className="tc-alternative"
              type="button"
              aria-pressed={completion === "approved-alternative"}
              onClick={() => setCompletion("approved-alternative")}
            >
              {copy.alternative}
            </button>
            <FeelTracks
              effort={effort}
              tiredness={tiredness}
              onEffortChange={setEffort}
              onTirednessChange={setTiredness}
            />
            <button
              className="tc-save"
              type="button"
              onClick={() => {
                void complete({ completion, effort, tiredness });
              }}
            >
              {copy.save}
            </button>
          </div>
        ) : (
          <button
            className="tc-plus"
            type="button"
            aria-label={copy.addLabel}
            onClick={() => setExpanded(true)}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </article>
      {connectedError ? (
        <p className="tc-sync-error" role="alert">
          {connectedError}
        </p>
      ) : null}
    </div>
  );
}
