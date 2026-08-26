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
  scale: number;
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
  editableEntityID = null,
  selectedEntityID = null,
  onPlace,
  onSelect,
  onScale,
  onDone,
}: {
  stamps: readonly LoungeStampOverlay[];
  spots: readonly LoungeStampSpotOverlay[];
  selectedStamp: StampAsset | null;
  placementPending?: boolean;
  editableEntityID?: string | null;
  selectedEntityID?: string | null;
  onPlace(zone: LoungeStampZone): void;
  onSelect?(entityID: string): void;
  onScale?(entityID: string, scale: number): void;
  onDone?(): void;
}) {
  const selected = stamps.find(({ entityID }) => entityID === selectedEntityID);
  return (
    <div className="team-lounge-v2__stamp-overlays" aria-live="polite">
      {stamps.map(({ entityID, asset, screen, scale }) => {
        const editable = entityID === editableEntityID;
        const selected = entityID === selectedEntityID;
        const className = `team-lounge-v2__placed-stamp${editable ? " team-lounge-v2__placed-stamp--editable" : ""}${selected ? " team-lounge-v2__placed-stamp--selected" : ""}`;
        const style = {
          transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%) scale(${scale})`,
        };
        const label = editable
          ? `${stampAssetLabel(asset)} stamp, yours; tap then drag to move`
          : `${stampAssetLabel(asset)} stamp placed by a teammate`;
        return editable ? (
          <button
            key={entityID}
            className={className}
            style={style}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onSelect?.(entityID)}
          >
            <StampAssetView asset={asset} />
          </button>
        ) : (
          <span
            key={entityID}
            className={className}
            style={style}
            aria-label={label}
          >
            <StampAssetView asset={asset} />
          </span>
        );
      })}
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
      {selected ? (
        <div
          className="team-lounge-v2__stamp-edit-controls"
          role="group"
          aria-label="Resize selected stamp"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>Drag to move</span>
          <button
            type="button"
            aria-label="Make stamp smaller"
            disabled={selected.scale <= 0.75}
            onClick={() =>
              onScale?.(
                selected.entityID,
                Math.max(0.75, Math.round((selected.scale - 0.1) * 10) / 10),
              )
            }
          >
            −
          </button>
          <button
            type="button"
            aria-label="Make stamp larger"
            disabled={selected.scale >= 1.4}
            onClick={() =>
              onScale?.(
                selected.entityID,
                Math.min(1.4, Math.round((selected.scale + 0.1) * 10) / 10),
              )
            }
          >
            +
          </button>
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
