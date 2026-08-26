import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";
import { LOUNGE_STAMP_ROTATIONS } from "../placement/orientation";

export interface LoungeStampOverlay {
  entityID: string;
  asset: StampAsset;
  ownerUserID: string | null;
  rotation: number;
  scale: number;
  screen: Readonly<{ x: number; y: number }>;
  placementDay: string | null;
}

export function StampOverlays({
  stamps,
  selectedStamp,
  placementPending = false,
  currentPlayerID,
  editableEntityIDs = [],
  selectedEntityID = null,
  onPlace,
  onSelect,
  onScale,
  onRotate,
  onDone,
}: {
  stamps: readonly LoungeStampOverlay[];
  selectedStamp: StampAsset | null;
  placementPending?: boolean;
  currentPlayerID: string;
  editableEntityIDs?: readonly string[];
  selectedEntityID?: string | null;
  onPlace(screen: Readonly<{ x: number; y: number }>): void;
  onSelect?(entityID: string): void;
  onScale?(entityID: string, scale: number): void;
  onRotate?(entityID: string, rotation: number): void;
  onDone?(): void;
}) {
  const selected = stamps.find(({ entityID }) => entityID === selectedEntityID);
  const editable = new Set(editableEntityIDs);
  return (
    <div className="team-lounge-v2__stamp-overlays" aria-live="polite">
      {stamps.map(
        ({ entityID, asset, ownerUserID, rotation, screen, scale }) => {
          const canEdit = editable.has(entityID);
          const selected = entityID === selectedEntityID;
          const className = `team-lounge-v2__placed-stamp${canEdit ? " team-lounge-v2__placed-stamp--editable" : ""}${selected ? " team-lounge-v2__placed-stamp--selected" : ""}`;
          const style = {
            transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%) rotate(${rotation}rad) scale(${scale})`,
          };
          const label = canEdit
            ? `${stampAssetLabel(asset)} stamp, yours; tap then drag to move`
            : ownerUserID === currentPlayerID
              ? `${stampAssetLabel(asset)} stamp, yours; locked from an earlier day`
              : `${stampAssetLabel(asset)} stamp placed by a teammate`;
          return canEdit ? (
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
        },
      )}
      {selectedStamp ? (
        <button
          className="team-lounge-v2__placement-surface"
          type="button"
          disabled={placementPending}
          aria-label={`Place ${stampAssetLabel(selectedStamp)} in the lounge`}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            onPlace({
              x: event.clientX - bounds.left,
              y: event.clientY - bounds.top,
            });
          }}
        >
          <span>Tap where you want it</span>
        </button>
      ) : null}
      {selected ? (
        <div
          className="team-lounge-v2__stamp-edit-controls"
          role="group"
          aria-label="Edit selected stamp"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>Drag the stamp to move it</span>
          <button
            className="team-lounge-v2__stamp-edit-done"
            type="button"
            onClick={onDone}
          >
            Done
          </button>
          <div className="team-lounge-v2__stamp-edit-tools">
            <div role="group" aria-label="Stamp tilt">
              <span>Turn</span>
              {LOUNGE_STAMP_ROTATIONS.map((rotation, index) => (
                <button
                  key={rotation}
                  type="button"
                  aria-label={
                    index === 0
                      ? "Tilt stamp left"
                      : index === 1
                        ? "Straighten stamp"
                        : "Tilt stamp right"
                  }
                  aria-pressed={Math.abs(selected.rotation - rotation) < 0.001}
                  onClick={() => onRotate?.(selected.entityID, rotation)}
                >
                  {index === 0 ? "−15°" : index === 1 ? "0°" : "+15°"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Stamp size">
              <span>Size</span>
              <button
                type="button"
                aria-label="Make stamp smaller"
                disabled={selected.scale <= 0.75}
                onClick={() =>
                  onScale?.(
                    selected.entityID,
                    Math.max(
                      0.75,
                      Math.round((selected.scale - 0.1) * 10) / 10,
                    ),
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
