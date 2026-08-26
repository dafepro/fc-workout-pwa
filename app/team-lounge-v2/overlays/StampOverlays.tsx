import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";
import type { LoungeStampZone } from "../placement/zones";

export interface LoungeStampOverlay {
  entityID: string;
  asset: StampAsset;
  ownerUserID: string | null;
  screen: Readonly<{ x: number; y: number }>;
}

export interface LoungeStampSpotOverlay {
  zone: LoungeStampZone;
  screen: Readonly<{ x: number; y: number }>;
}

export function StampOverlays({
  stamps,
  spots,
  selectedStamp,
  placementPending = false,
  onPlace,
}: {
  stamps: readonly LoungeStampOverlay[];
  spots: readonly LoungeStampSpotOverlay[];
  selectedStamp: StampAsset | null;
  placementPending?: boolean;
  onPlace(zone: LoungeStampZone): void;
}) {
  return (
    <div className="team-lounge-v2__stamp-overlays" aria-live="polite">
      {stamps.map(({ entityID, asset, screen }) => (
        <span
          key={entityID}
          className="team-lounge-v2__placed-stamp"
          style={{
            transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`,
          }}
          aria-label={`${stampAssetLabel(asset)} stamp placed by a teammate`}
        >
          <StampAssetView asset={asset} />
        </span>
      ))}
      {selectedStamp
        ? spots.map(({ zone, screen }) => (
            <button
              key={zone.id}
              className="team-lounge-v2__stamp-spot"
              style={{
                transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`,
              }}
              type="button"
              disabled={placementPending}
              aria-label={`Place ${stampAssetLabel(selectedStamp)} at ${zone.label}`}
              onClick={() => onPlace(zone)}
            >
              <span aria-hidden="true" />
            </button>
          ))
        : null}
    </div>
  );
}
