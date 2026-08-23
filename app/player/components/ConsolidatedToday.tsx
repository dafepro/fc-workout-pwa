"use client";

import Link from "next/link";
import { useState } from "react";
import { momentumBand } from "../../momentum-alpha/model";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { teamCanvasCopy } from "../../team-canvas/content";
import type { CompletionKind } from "../../team-canvas/model";
import { useTeamCanvas } from "../../team-canvas/state";
import { FeelTracks } from "../../team-canvas/components/FeelTracks";
import { playerExperienceCopy } from "../content";
import { TeamRewardsPreview } from "./TeamRewardsPreview";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { MomentumStatus } from "./MomentumStatus";

export function ConsolidatedToday() {
  const momentum = useMomentumAlpha();
  const canvas = useTeamCanvas();
  const dev = usePlayerDevSettings();
  const [expanded, setExpanded] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const liveBand = momentumBand(momentum.state.personalMomentum);
  const band =
    dev.settings.momentumBand === "real" ? liveBand : dev.settings.momentumBand;
  const liveUnlocked =
    canvas.connectedStatus === "ready" ||
    (canvas.connectedStatus === "local" && canvas.state.primaryComplete);
  const unlockedByToday =
    dev.settings.today === "complete"
      ? true
      : dev.settings.today === "training" || dev.settings.today === "rest"
        ? false
        : liveUnlocked;
  const unlocked =
    dev.settings.teamAccess === "locked" ? false : unlockedByToday;
  const restDay =
    dev.settings.today === "rest" ||
    (dev.settings.today === "real" && momentum.state.dayKind === "rest");
  const previewingToday = dev.settings.today !== "real";

  async function save() {
    setSaveError("");
    setSaving(true);
    try {
      const saved = await canvas.complete({ completion, effort, tiredness });
      if (saved) {
        setExpanded(false);
      } else {
        setSaveError("That workout could not be saved. Please try again.");
      }
    } catch {
      setSaveError("That workout could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (canvas.connectedStatus === "loading" || momentum.loading) {
    return (
      <div className="player-page player-page--today" aria-busy="true">
        <p className="player-opening">Opening today’s plan…</p>
      </div>
    );
  }

  return (
    <div className="player-page player-page--today">
      {dev.settings.momentumVisible ? (
        <MomentumStatus
          band={band}
          restDay={restDay}
          planComplete={unlockedByToday}
          recoveryComplete={momentum.state.recoveryComplete}
        />
      ) : null}

      {unlocked ? (
        <section
          className="today-complete"
          aria-labelledby="today-complete-title"
        >
          <span aria-hidden="true">✓</span>
          <div>
            <p className="player-eyebrow">Plan followed</p>
            <h1 id="today-complete-title">
              {playerExperienceCopy.today.completionTitle}
            </h1>
            <p>{playerExperienceCopy.today.completionBody}</p>
          </div>
          <Link href="/team">{playerExperienceCopy.today.joinTeam} →</Link>
        </section>
      ) : restDay ? (
        <RestPlan
          onRecord={() => canvas.recordRest()}
          previewOnly={previewingToday}
        />
      ) : (
        <section className="today-plan" aria-labelledby="today-plan-title">
          <span
            className="today-plan__mark"
            data-testid="workout-mark"
            aria-hidden="true"
          >
            ↗
          </span>
          <div className="today-plan__heading">
            <div>
              <p className="player-eyebrow">
                {playerExperienceCopy.today.eyebrow}
              </p>
              <h1 id="today-plan-title">
                {teamCanvasCopy.today.trainingTitle}
              </h1>
            </div>
            <span>8–10 min</span>
          </div>
          <p className="today-plan__workload">8 reps · 6 seconds each</p>
          <p className="today-plan__instruction">
            {teamCanvasCopy.today.trainingDescription}
          </p>

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
                  Not yet
                </button>
                <button
                  type="button"
                  className="today-checkin__save"
                  disabled={previewingToday || saving}
                  onClick={() => void save()}
                >
                  {previewingToday
                    ? "Preview only"
                    : saving
                      ? "Saving…"
                      : teamCanvasCopy.today.save}
                </button>
              </div>
              {canvas.connectedError || saveError ? (
                <p role="alert">{canvas.connectedError ?? saveError}</p>
              ) : null}
            </div>
          ) : (
            <button
              className="today-plan__log"
              type="button"
              aria-label={playerExperienceCopy.today.log}
              onClick={() => setExpanded(true)}
            >
              <strong>{playerExperienceCopy.today.log}</strong>
              <small>{playerExperienceCopy.today.logPreview}</small>
              <span aria-hidden="true">›</span>
            </button>
          )}

          <details className="today-plan__why">
            <summary>{playerExperienceCopy.today.why}</summary>
            <ul>
              {momentum.presentation.plan.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <TeamRewardsPreview placement="today" />

      <Link
        className={`team-preview${unlocked ? " is-unlocked" : ""}`}
        href="/team"
      >
        <span
          className="team-preview__mark"
          data-testid="lounge-mark"
          aria-hidden="true"
        >
          <i />
        </span>
        <div>
          <p className="player-eyebrow">Creative team space</p>
          <h2>{playerExperienceCopy.today.lockedTeamTitle}</h2>
          <p>
            {unlocked
              ? playerExperienceCopy.today.unlockedTeamBody
              : playerExperienceCopy.today.lockedTeamBody}
          </p>
        </div>
        <span className="team-preview__action" aria-hidden="true">
          {unlocked ? "→" : "◆"}
        </span>
      </Link>
    </div>
  );
}

function RestPlan({
  onRecord,
  previewOnly,
}: {
  onRecord(): Promise<void>;
  previewOnly: boolean;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <section className="today-plan today-plan--rest">
      <p className="player-eyebrow">Today · planned recovery</p>
      <h1>{teamCanvasCopy.today.restTitle}</h1>
      <p>{teamCanvasCopy.today.restDescription}</p>
      <button
        type="button"
        disabled={previewOnly || saving}
        onClick={() => {
          setSaving(true);
          void onRecord().finally(() => setSaving(false));
        }}
      >
        {previewOnly
          ? "Preview only"
          : saving
            ? "Saving…"
            : teamCanvasCopy.today.restAction}
      </button>
    </section>
  );
}
