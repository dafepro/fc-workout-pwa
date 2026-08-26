import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";

export type StampPlacementStatus =
  | "loading"
  | "ready"
  | "local"
  | "placed"
  | "error";

export function StampPlacementTray({
  choices,
  selected,
  placed,
  status,
  error,
  onSelect,
}: {
  choices: readonly StampAsset[];
  selected: StampAsset | null;
  placed: StampAsset | null;
  status: StampPlacementStatus;
  error: string | null;
  onSelect(asset: StampAsset): void;
}) {
  if (status === "loading") {
    return (
      <p className="team-lounge-v2__tray-note" role="status">
        Loading your stamps…
      </p>
    );
  }
  if (status === "local") {
    return (
      <p className="team-lounge-v2__tray-note" role="status">
        Join the shared team room to leave a weekly stamp.
      </p>
    );
  }
  if (status === "placed" && placed) {
    return (
      <div className="team-lounge-v2__stamp-placed" role="status">
        <StampAssetView asset={placed} />
        <span>
          <strong>Your stamp is here for the week.</strong>
          {stampAssetLabel(placed)} was added to the lounge.
        </span>
      </div>
    );
  }

  return (
    <section
      className="team-lounge-v2__stamp-tray"
      aria-label="Choose a stamp to place"
    >
      <div>
        <h2>Leave one stamp this week</h2>
        <p>
          {selected
            ? "Choose a glowing spot in the lounge."
            : "Pick something from your collection."}
        </p>
      </div>
      {error ? (
        <p className="team-lounge-v2__placement-error" role="alert">
          {error}
        </p>
      ) : null}
      {choices.length === 0 ? (
        <p className="team-lounge-v2__tray-note">
          No stamps are available to place yet.
        </p>
      ) : (
        <div className="team-lounge-v2__stamp-choices">
          {choices.map((asset) => {
            const label = stampAssetLabel(asset);
            return (
              <button
                key={asset.id}
                type="button"
                aria-label={`Choose ${label} stamp`}
                aria-pressed={selected?.id === asset.id}
                onClick={() => onSelect(asset)}
              >
                <StampAssetView asset={asset} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
