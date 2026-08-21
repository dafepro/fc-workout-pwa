"use client";

import Link from "next/link";
import { momentumAlphaCopy } from "../content";
import { momentumAlphaMock } from "../mock-data";
import { momentumAlphaRoutes } from "../routes";
import { useMomentumAlpha } from "../state";

export function MomentumMe({
  player = momentumAlphaMock.player,
  showReviewControls = false,
}: {
  player?: {
    firstName: string;
    lastInitial: string;
    team: string;
    initials?: string;
  };
  showReviewControls?: boolean;
}) {
  const { state, previewDay, reset } = useMomentumAlpha();
  const content = momentumAlphaCopy.me;

  return (
    <div className="ma-page ma-me">
      <header className="ma-profile">
        <span className="ma-profile__avatar" aria-hidden="true">
          {player.initials ?? `${player.firstName[0]}${player.lastInitial[0]}`}
        </span>
        <div>
          <p className="ma-eyebrow">{content.eyebrow}</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{player.team}</p>
        </div>
      </header>

      <section className="ma-history" aria-labelledby="ma-history-title">
        <div className="ma-section-heading">
          <div>
            <p className="ma-eyebrow">{content.historyEyebrow}</p>
            <h2 id="ma-history-title">{content.historyTitle}</h2>
          </div>
          <span>{content.privateBadge}</span>
        </div>
        {state.history.length === 0 ? (
          <p className="ma-history__empty">{content.historyEmpty}</p>
        ) : (
          <ul>
            {[...state.history].reverse().map((entry) => (
              <li key={entry.id}>
                <span
                  className={`ma-history__mark ma-history__mark--${entry.kind}`}
                  aria-hidden="true"
                >
                  {entry.kind === "rest"
                    ? "☾"
                    : entry.kind === "recovery"
                      ? "≈"
                      : "✓"}
                </span>
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </div>
                <em>{historyEffect(entry.momentumEffect)}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ma-switch" aria-labelledby="ma-switch-title">
        <div className="ma-switch__mark" aria-hidden="true">
          ↔
        </div>
        <div>
          <p className="ma-eyebrow">{content.switchEyebrow}</p>
          <h2 id="ma-switch-title">{content.switchTitle}</h2>
          <p>{content.switchBody}</p>
        </div>
        <Link
          className="ma-button ma-button--ghost"
          href={momentumAlphaRoutes.classicMe}
        >
          {content.switchBack}
        </Link>
      </section>

      {showReviewControls ? (
        <section
          className="ma-review-controls"
          aria-labelledby="ma-review-title"
        >
          <p className="ma-eyebrow">{content.reviewEyebrow}</p>
          <h2 id="ma-review-title">{content.reviewTitle}</h2>
          <p>{content.reviewBody}</p>
          <div>
            <button type="button" onClick={() => previewDay("training")}>
              {content.trainingDay}
            </button>
            <button type="button" onClick={() => previewDay("rest")}>
              {content.restDay}
            </button>
            <button type="button" onClick={reset}>
              {content.reset}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function historyEffect(effect: string): string {
  const labels: Record<string, string> = {
    full: "Full Momentum",
    small: "Goal + optional stretch",
    partial: "Partial Momentum",
    supportive: "Supports Momentum",
    hold: "Momentum held steady",
    "history-only": "History only",
  };
  return labels[effect] ?? effect;
}
