"use client";

import type { CSSProperties } from "react";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { useOptionalAuth } from "../../state/auth-context";
import { playerExperienceCopy } from "../content";
import {
  momentumProgress,
  type MomentumProgressState,
} from "../momentum-progress";

export function MomentumStatus({
  weeklySessions,
  weeklyGoal,
  currentStreak,
  restDay,
  planComplete,
  stateOverride,
}: {
  weeklySessions: number;
  weeklyGoal: number;
  currentStreak: number;
  restDay: boolean;
  planComplete: boolean;
  stateOverride?: MomentumProgressState;
}) {
  const auth = useOptionalAuth();
  const copy = playerExperienceCopy.momentum;
  const progress = momentumProgress(weeklySessions, weeklyGoal);
  const state = stateOverride ?? progress.state;
  const stateCopy = copy.states[state];
  const hint = guidance(
    progress.remaining,
    restDay,
    planComplete,
    copy.guidance,
  );
  const gaugeStyle = {
    "--momentum-progress": `${progress.percentage * 3.6}deg`,
  } as CSSProperties;

  return (
    <section
      className={`momentum-status momentum-status--${state}`}
      aria-label={`${stateOverride ? "Momentum preview is" : "Momentum is"} ${state}`}
    >
      <header className="momentum-status__header">
        <div className="momentum-status__identity">
          {auth ? (
            <PlayerAvatar
              player={auth.currentPlayer}
              size="small"
              emphasizeSelf={false}
            />
          ) : null}
          <div>
            <p className="player-eyebrow">{copy.eyebrow}</p>
            <h2>{stateCopy.label}</h2>
          </div>
        </div>
        <p className="momentum-status__streak">
          <span aria-hidden="true">↗</span>
          {copy.streak(Math.max(0, Math.floor(currentStreak)))}
        </p>
      </header>

      <div className="momentum-status__body">
        <div
          className="momentum-status__gauge"
          role="progressbar"
          aria-label={copy.accessibleGauge(
            progress.weeklySessions,
            progress.weeklyGoal,
          )}
          aria-valuemin={0}
          aria-valuemax={progress.weeklyGoal}
          aria-valuenow={progress.gaugeValue}
          style={gaugeStyle}
        >
          <div>
            <strong>
              {progress.weeklySessions} <span>of {progress.weeklyGoal}</span>
            </strong>
            <small>{copy.thisWeek}</small>
          </div>
        </div>
        <div className="momentum-status__copy">
          {stateOverride ? (
            <span className="momentum-status__preview">{copy.preview}</span>
          ) : null}
          <p className="momentum-status__detail">{stateCopy.detail}</p>
          <div className="momentum-status__guidance">
            <span aria-hidden="true">→</span>
            <div>
              <small>{copy.guidanceLabel}</small>
              <p>{hint}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function guidance(
  remaining: number,
  restDay: boolean,
  planComplete: boolean,
  copy: typeof playerExperienceCopy.momentum.guidance,
): string {
  if (remaining === 0) return copy.goalComplete;
  const progress = copy.remaining(remaining);
  if (restDay) return `${progress} ${copy.plannedRest}`;
  if (planComplete) return `${progress} ${copy.planComplete}`;
  return `${progress} ${copy.recommendedPlan}`;
}
