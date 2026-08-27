"use client";

import { useId, useState, type CSSProperties } from "react";
import { copy } from "../content/copy";
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
  const titleId = useId();
  const explanationId = useId();
  const progress = momentumProgress(momentumScore);
  const streak = Math.max(0, Math.floor(checkInStreak));
  const gaugeStyle = {
    "--momentum-progress": `${progress.percentage * 3.6}deg`,
  } as CSSProperties;

  return (
    <section
      className={`momentum-status momentum-status--${progress.state}`}
      aria-labelledby={titleId}
    >
      <div
        className="momentum-status__gauge"
        role="progressbar"
        aria-label={copy.momentum.gauge(progress.score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.score}
        style={gaugeStyle}
      >
        <span aria-hidden="true">{progress.score}</span>
      </div>
      <div className="momentum-status__content">
        <p className="eyebrow">{copy.momentum.eyebrow}</p>
        <h2 id={titleId}>{copy.momentum.states[progress.state]}</h2>
        <p className="momentum-status__summary">
          <strong>{copy.momentum.metric(progress.score)}</strong>
          <span>{copy.momentum.streak(streak)}</span>
        </p>
        <button
          type="button"
          className="momentum-status__info"
          aria-expanded={showExplanation}
          aria-controls={explanationId}
          onClick={() => setShowExplanation((visible) => !visible)}
        >
          {copy.momentum.infoAction}
        </button>
        {showExplanation ? (
          <p
            className="momentum-status__explanation"
            id={explanationId}
            role="status"
          >
            {copy.momentum.info}
          </p>
        ) : null}
      </div>
    </section>
  );
}
