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
  momentumScore,
  weeklyCheckIns,
  weeklyGoal,
  checkInStreak,
  stateOverride,
}: {
  momentumScore: number;
  weeklyCheckIns: number;
  weeklyGoal: number;
  checkInStreak: number;
  stateOverride?: MomentumProgressState;
}) {
  const auth = useOptionalAuth();
  const copy = playerExperienceCopy.momentum;
  const progress = momentumProgress(momentumScore);
  const state = stateOverride ?? progress.state;
  const stateCopy = copy.states[state];
  const hint = weeklyGuidance(weeklyCheckIns, weeklyGoal, copy);
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
          {copy.streak(Math.max(0, Math.floor(checkInStreak)))}
        </p>
      </header>

      <div className="momentum-status__body">
        <div
          className="momentum-status__gauge"
          role="progressbar"
          aria-label={copy.accessibleGauge(progress.score)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.score}
          style={gaugeStyle}
        >
          <div>
            <strong>{progress.score}</strong>
            <small>{copy.gaugeLabel}</small>
          </div>
        </div>
        <div className="momentum-status__copy">
          {stateOverride ? (
            <span className="momentum-status__preview">{copy.preview}</span>
          ) : null}
          <div
            className="momentum-status__guidance"
            data-testid="momentum-advice"
          >
            <span aria-hidden="true">→</span>
            <div>
              <small>{copy.guidanceLabel}</small>
              <p>{hint}</p>
              <p className="momentum-status__tip">{copy.improvementTip}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function weeklyGuidance(
  weeklyCheckIns: number,
  weeklyGoal: number,
  copy: typeof playerExperienceCopy.momentum,
): string {
  const checkIns = Math.max(0, Math.floor(weeklyCheckIns));
  const goal = Math.max(1, Math.floor(weeklyGoal));
  if (checkIns >= goal) return copy.weeklyComplete(goal);
  if (checkIns === 0) return copy.firstCheckIn;
  return copy.weeklyProgress(checkIns, goal - checkIns);
}
