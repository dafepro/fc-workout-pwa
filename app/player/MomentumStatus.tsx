"use client";

import { useState, type CSSProperties } from "react";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { copy } from "../content/copy";
import { useOptionalAuth } from "../state/auth-context";
import { momentumProgress } from "./momentum-progress";

type MomentumStatusProps = {
  momentumScore: number;
  checkInStreak: number;
};

export function MomentumStatus({
  momentumScore,
  checkInStreak,
}: MomentumStatusProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const auth = useOptionalAuth();
  const progress = momentumProgress(momentumScore);
  const streak = Math.max(0, Math.floor(checkInStreak));
  const gaugeStyle = {
    "--player-momentum-progress": `${progress.percentage * 3.6}deg`,
  } as CSSProperties;

  return (
    <section className="player-status" aria-label={copy.momentum.eyebrow}>
      <header className="player-status-row">
        {auth ? (
          <PlayerAvatar
            player={auth.currentPlayer}
            size="small"
            emphasizeSelf={false}
          />
        ) : (
          <span className="player-status-row__avatar" aria-hidden="true">
            Z
          </span>
        )}
        <div className="player-status-row__summary">
          <span
            className="player-status-row__gauge"
            role="progressbar"
            aria-label={copy.momentum.gauge(progress.score)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.score}
            style={gaugeStyle}
          >
            <span aria-hidden="true" />
          </span>
          <span className="player-status-row__metric">
            <small>Momentum</small>
            <strong>{progress.score}</strong>
          </span>
          <span className="player-status-row__streak">
            <span aria-hidden="true">🔥</span>
            <strong>{streak}</strong>
            <small>day streak</small>
          </span>
          <span className="sr-only">
            {copy.momentum.metric(progress.score)}
          </span>
          <span className="sr-only">{copy.momentum.streak(streak)}</span>
          <h2 className="sr-only">{copy.momentum.states[progress.state]}</h2>
        </div>
        <button
          type="button"
          className="player-status-row__info"
          aria-expanded={showExplanation}
          onClick={() => setShowExplanation((visible) => !visible)}
        >
          <span aria-hidden="true">i</span>
          <span className="sr-only">{copy.momentum.infoAction}</span>
        </button>
      </header>
      {showExplanation ? (
        <p className="player-status__info" role="status">
          {copy.momentum.info}
        </p>
      ) : null}
    </section>
  );
}
