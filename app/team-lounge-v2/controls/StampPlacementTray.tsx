import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";
import type { LoungePlacementSummary } from "../SharedLoungeCanvas";
import { teamLoungeV2Copy as copy } from "../content";

export type StampPlacementStatus =
  | "loading"
  | "ready"
  | "placing"
  | "local"
  | "exhausted"
  | "error";

export interface StampPlacementChoice {
  asset: StampAsset;
  source: "included" | "earned";
  isNew: boolean;
}

export function StampPlacementTray({
  choices,
  selected,
  summary,
  status,
  error,
  onSelect,
}: {
  choices: readonly StampPlacementChoice[];
  selected: StampAsset | null;
  summary: LoungePlacementSummary | null;
  status: StampPlacementStatus;
  error: string | null;
  onSelect(asset: StampAsset): void;
}) {
  if (status === "loading") {
    return (
      <p className="team-lounge-v2__tray-note" role="status">
        {copy.placementTray.loading}
      </p>
    );
  }
  if (status === "local") {
    return (
      <p className="team-lounge-v2__tray-note" role="status">
        {copy.placementTray.sharedOnly}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="team-lounge-v2__tray-note" role="alert">
        {copy.placementTray.error}
      </p>
    );
  }
  const remaining = summary?.remaining ?? 0;
  const title =
    remaining > 0
      ? copy.placementTray.ready(remaining)
      : summary?.earned === 0
        ? copy.placementTray.earn
        : copy.placementTray.used;
  const instruction = selected
    ? status === "placing"
      ? copy.placementTray.placing
      : copy.placementTray.place
    : status === "exhausted"
      ? copy.placementTray.locked
      : copy.placementTray.explanation;

  return (
    <section
      className="team-lounge-v2__stamp-tray"
      aria-label="Choose a stamp to place"
      aria-busy={status === "placing"}
    >
      <div>
        <h2>{title}</h2>
        <p>{instruction}</p>
      </div>
      {error ? (
        <p className="team-lounge-v2__placement-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === "exhausted" ? null : choices.length === 0 ? (
        <p className="team-lounge-v2__tray-note">{copy.placementTray.empty}</p>
      ) : (
        <div className="team-lounge-v2__stamp-choices">
          {choices.map(({ asset, source, isNew }) => {
            const label = stampAssetLabel(asset);
            return (
              <button
                key={asset.id}
                type="button"
                aria-label={`Choose ${label} stamp`}
                aria-pressed={selected?.id === asset.id}
                disabled={status === "placing" || remaining === 0}
                onClick={() => onSelect(asset)}
              >
                <StampAssetView asset={asset} />
                <span className="team-lounge-v2__stamp-label">{label}</span>
                <small>
                  {isNew ? "New" : source === "earned" ? "Earned" : "Included"}
                </small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
