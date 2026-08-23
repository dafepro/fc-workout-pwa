"use client";

import Image from "next/image";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { momentumAlphaCopy } from "../../momentum-alpha/content";
import type { MomentumBand } from "../../momentum-alpha/model";
import { useOptionalAuth } from "../../state/auth-context";
import { playerExperienceCopy } from "../content";

const bands: MomentumBand[] = ["warming-up", "building", "rolling", "strong"];

export function MomentumStatus({
  band,
  restDay,
  planComplete,
  recoveryComplete,
}: {
  band: MomentumBand;
  restDay: boolean;
  planComplete: boolean;
  recoveryComplete: boolean;
}) {
  const auth = useOptionalAuth();
  const copy = playerExperienceCopy.momentum;
  const activeBand = bands.indexOf(band);
  const recommendation = restDay
    ? copy.recommendation.rest
    : planComplete && !recoveryComplete
      ? copy.recommendation.recovery
      : planComplete
        ? copy.recommendation.team
        : copy.recommendation.goal;

  return (
    <section
      className={`momentum-status momentum-status--${band}`}
      aria-label={`Momentum is ${band}`}
    >
      <div className="momentum-status__heading">
        {auth ? (
          <PlayerAvatar
            player={auth.currentPlayer}
            size="small"
            emphasizeSelf={false}
          />
        ) : null}
        <div>
          <p className="player-eyebrow">{copy.eyebrow}</p>
          <strong>{momentumAlphaCopy.trail.bands[band]}</strong>
        </div>
      </div>

      <p className="momentum-status__detail">{copy.detail[band]}</p>

      <Image
        className="momentum-status__art"
        src="/art/zoomi/zoomi-momentum.webp"
        alt={copy.artAlt}
        width={900}
        height={600}
        priority
      />

      <div
        className="momentum-status__path"
        role="progressbar"
        aria-label={`Momentum path: ${momentumAlphaCopy.trail.bands[band]}`}
        aria-valuemin={1}
        aria-valuemax={bands.length}
        aria-valuenow={activeBand + 1}
      >
        <span className="momentum-status__path-line" aria-hidden="true" />
        {bands.map((item, index) => (
          <span
            key={item}
            className={
              index === activeBand
                ? "is-active"
                : index < activeBand
                  ? "is-passed"
                  : ""
            }
          >
            <i aria-hidden="true" />
            <small>{copy.path[item]}</small>
          </span>
        ))}
      </div>

      <div className="momentum-status__recommendation">
        <span aria-hidden="true">↗</span>
        <div>
          <small>{copy.recommendationLabel}</small>
          <p>{recommendation}</p>
        </div>
      </div>
    </section>
  );
}
