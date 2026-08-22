import { playerExperienceCopy } from "../content";

export function TeamRewardsPreview({
  placement,
}: {
  placement: "today" | "team";
}) {
  const copy = playerExperienceCopy.rewards;
  return (
    <section
      className={`player-rewards player-rewards--${placement}`}
      aria-labelledby={`player-rewards-${placement}`}
    >
      <div>
        <p className="player-eyebrow" id={`player-rewards-${placement}`}>
          {copy.eyebrow}
        </p>
        {placement === "today" ? (
          <p>{copy.todayBody}</p>
        ) : (
          <>
            <strong>{copy.progress}</strong>
            <div
              className="player-rewards__progress"
              role="progressbar"
              aria-label="Preview team participation"
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={9}
            >
              <span />
            </div>
            <p>{copy.teamBody}</p>
          </>
        )}
        <small>{copy.previewLabel}</small>
      </div>
      <span className="player-rewards__mystery" aria-hidden="true">
        ?
      </span>
    </section>
  );
}
