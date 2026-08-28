"use client";

import type { CSSProperties } from "react";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { copy } from "../content/copy";
import { useOptionalAuth } from "../state/auth-context";
import { momentumProgress } from "./momentum-progress";

export function MomentumDetail({
  momentumScore,
  weeklyCheckIns,
  weeklyGoal,
  checkInStreak,
}: {
  momentumScore: number;
  weeklyCheckIns: number;
  weeklyGoal: number;
  checkInStreak: number;
}) {
  const auth = useOptionalAuth();
  const progress = momentumProgress(momentumScore);
  const stateLabel = copy.momentum.states[progress.state];
  const gaugeStyle = {
    "--momentum-progress": `${progress.percentage * 3.6}deg`,
  } as CSSProperties;

  return (
    <section
      className={`momentum-detail momentum-detail--${progress.state}`}
      aria-label={`Momentum is ${progress.state}`}
    >
      <header className="momentum-detail__header">
        <div className="momentum-detail__identity">
          {auth ? (
            <PlayerAvatar
              player={auth.currentPlayer}
              size="small"
              emphasizeSelf={false}
            />
          ) : null}
          <div>
            <p className="eyebrow">{copy.momentum.eyebrow}</p>
            <h2>{stateLabel}</h2>
          </div>
        </div>
        <p className="momentum-detail__streak">
          <span aria-hidden="true">↗</span>
          {copy.momentum.streak(Math.max(0, Math.floor(checkInStreak)))}
        </p>
      </header>
      <div className="momentum-detail__body">
        <div
          className="momentum-detail__gauge"
          role="progressbar"
          aria-label={copy.momentum.gauge(progress.score)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.score}
          style={gaugeStyle}
        >
          <div>
            <strong>{progress.score}</strong>
            <small>{copy.momentum.gaugeLabel}</small>
          </div>
        </div>
        <div className="momentum-detail__guidance">
          <span aria-hidden="true">→</span>
          <div>
            <small>{copy.momentum.guidanceLabel}</small>
            <p>{weeklyGuidance(weeklyCheckIns, weeklyGoal)}</p>
            <p className="momentum-detail__tip">
              {copy.momentum.improvementTip}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function weeklyGuidance(checkIns: number, target: number): string {
  const current = Math.max(0, Math.floor(checkIns));
  const goal = Math.max(1, Math.floor(target));
  if (current >= goal) return copy.momentum.weeklyComplete(goal);
  if (current === 0) return copy.momentum.firstCheckIn;
  return copy.momentum.weeklyProgress(current, goal - current);
}
