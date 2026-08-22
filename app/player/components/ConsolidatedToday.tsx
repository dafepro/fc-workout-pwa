"use client";

import Link from "next/link";
import { useState } from "react";
import { momentumAlphaCopy } from "../../momentum-alpha/content";
import { momentumBand } from "../../momentum-alpha/model";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { teamCanvasCopy } from "../../team-canvas/content";
import type { CompletionKind } from "../../team-canvas/model";
import { useTeamCanvas } from "../../team-canvas/state";
import { FeelTracks } from "../../team-canvas/components/FeelTracks";
import { playerExperienceCopy } from "../content";
import { TeamRewardsPreview } from "./TeamRewardsPreview";

export function ConsolidatedToday() {
  const momentum = useMomentumAlpha();
  const canvas = useTeamCanvas();
  const [expanded, setExpanded] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const band = momentumBand(momentum.state.personalMomentum);
  const unlocked =
    canvas.connectedStatus === "ready" || canvas.state.primaryComplete;

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
      <MomentumStatus band={band} />

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
      ) : canvas.state.dayKind === "rest" ? (
        <RestPlan onRecord={() => canvas.recordRest()} />
      ) : (
        <section className="today-plan" aria-labelledby="today-plan-title">
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
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : teamCanvasCopy.today.save}
                </button>
              </div>
              {saveError ? <p role="alert">{saveError}</p> : null}
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
        <div>
          <p className="player-eyebrow">Creative team space</p>
          <h2>{playerExperienceCopy.today.lockedTeamTitle}</h2>
          <p>
            {unlocked
              ? playerExperienceCopy.today.unlockedTeamBody
              : playerExperienceCopy.today.lockedTeamBody}
          </p>
        </div>
        <span aria-hidden="true">{unlocked ? "→" : "◆"}</span>
      </Link>
    </div>
  );
}

function MomentumStatus({ band }: { band: ReturnType<typeof momentumBand> }) {
  return (
    <section className="momentum-status" aria-label={`Momentum is ${band}`}>
      <div className="momentum-status__trail" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className="player-eyebrow">
          {playerExperienceCopy.momentum.eyebrow}
        </p>
        <strong>{momentumAlphaCopy.trail.bands[band]}</strong>
        <p>{playerExperienceCopy.momentum.detail[band]}</p>
      </div>
    </section>
  );
}

function RestPlan({ onRecord }: { onRecord(): Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <section className="today-plan today-plan--rest">
      <p className="player-eyebrow">Today · planned recovery</p>
      <h1>{teamCanvasCopy.today.restTitle}</h1>
      <p>{teamCanvasCopy.today.restDescription}</p>
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void onRecord().finally(() => setSaving(false));
        }}
      >
        {saving ? "Saving…" : teamCanvasCopy.today.restAction}
      </button>
    </section>
  );
}
