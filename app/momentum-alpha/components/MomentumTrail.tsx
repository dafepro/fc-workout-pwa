import { momentumAlphaCopy } from "../content";
import type { MomentumBand } from "../model";

export function MomentumTrail({
  kind,
  band,
}: {
  kind: "personal" | "team";
  band: MomentumBand;
}) {
  const label =
    kind === "personal"
      ? momentumAlphaCopy.trail.personal
      : momentumAlphaCopy.trail.team;
  const state = momentumAlphaCopy.trail.bands[band];
  const detail =
    kind === "personal"
      ? momentumAlphaCopy.trail.personalDetail[band]
      : momentumAlphaCopy.trail.teamDetail;
  const activeNodes = { "warming-up": 1, building: 2, rolling: 3, strong: 4 }[
    band
  ];

  return (
    <section
      className={`ma-trail ma-trail--${kind}`}
      role="img"
      aria-label={`${label} is ${state.toLowerCase()} — ${detail.toLowerCase()}`}
    >
      <div className="ma-trail__copy">
        <span>{label}</span>
        <strong>{state}</strong>
        <p>{detail}</p>
      </div>
      <div className="ma-trail__visual" aria-hidden="true">
        <svg viewBox="0 0 420 108" preserveAspectRatio="none">
          <path
            className="ma-trail__shadow"
            d="M8 87 C68 87 66 30 132 38 S203 99 270 64 S339 17 412 25"
          />
          <path
            className="ma-trail__line"
            d="M8 87 C68 87 66 30 132 38 S203 99 270 64 S339 17 412 25"
          />
        </svg>
        <div className="ma-trail__nodes">
          {[1, 2, 3, 4, 5].map((node) => (
            <span
              key={node}
              className={node <= activeNodes ? "is-active" : ""}
            />
          ))}
        </div>
        <span className="ma-trail__runner">→</span>
      </div>
    </section>
  );
}
