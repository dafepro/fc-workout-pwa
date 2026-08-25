"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { useOptionalAuth } from "../../state/auth-context";
import { playerExperienceCopy } from "../content";

export function CompactPlayerStatus({
  momentumScore,
  checkInStreak,
}: {
  momentumScore: number;
  checkInStreak: number;
}) {
  const auth = useOptionalAuth();
  const score = Math.min(100, Math.max(0, Math.round(momentumScore * 10) / 10));
  const streak = Math.max(0, Math.floor(checkInStreak));
  const copy = playerExperienceCopy.focusedToday;
  const [infoOpen, setInfoOpen] = useState(false);
  const gaugeStyle = {
    "--player-momentum-progress": `${score * 3.6}deg`,
  } as CSSProperties;

  return (
    <div className="player-status">
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
        <Link
          className="player-status-row__summary"
          href="/progress"
          aria-label={copy.momentumSummary(score, streak)}
        >
          <span
            className="player-status-row__gauge"
            role="progressbar"
            aria-label={copy.momentumGauge(score)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            style={gaugeStyle}
          >
            <span aria-hidden="true" />
          </span>
          <span className="player-status-row__metric">
            <small>Momentum</small>
            <strong>{score}</strong>
          </span>
          <span className="player-status-row__streak">
            <span aria-hidden="true">🔥</span>
            <strong>{streak}</strong>
            <small>day streak</small>
          </span>
        </Link>
        <button
          className="player-status-row__info"
          type="button"
          aria-label="What Momentum means"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((open) => !open)}
        >
          i
        </button>
      </header>
      {infoOpen ? (
        <p className="player-status__info" role="status">
          {copy.momentumInfo}
        </p>
      ) : null}
    </div>
  );
}
