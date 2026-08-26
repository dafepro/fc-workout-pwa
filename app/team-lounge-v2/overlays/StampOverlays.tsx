import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";
import { nextLoungeStampRotation } from "../placement/orientation";

export interface LoungeStampOverlay {
  entityID: string;
  asset: StampAsset;
  ownerUserID: string | null;
  rotation: number;
  scale: number;
  screen: Readonly<{ x: number; y: number }>;
  world: Readonly<{ x: number; y: number; z?: number }> | null;
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
  onScale?(entityID: string, scale: number, preview: boolean): void;
  onRotate?(entityID: string, rotation: number, preview: boolean): void;
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
            <div role="group" aria-label="Stamp rotation">
              <span>Turn</span>
              <TransformStepButton
                ariaLabel="Rotate stamp left 15 degrees"
                value={selected.rotation}
                next={(rotation) => nextLoungeStampRotation(rotation, -1)}
                onPreview={(rotation) =>
                  onRotate?.(selected.entityID, rotation, true)
                }
                onCommit={(rotation) =>
                  onRotate?.(selected.entityID, rotation, false)
                }
              >
                ↺ 15°
              </TransformStepButton>
              <TransformStepButton
                ariaLabel="Rotate stamp right 15 degrees"
                value={selected.rotation}
                next={(rotation) => nextLoungeStampRotation(rotation, 1)}
                onPreview={(rotation) =>
                  onRotate?.(selected.entityID, rotation, true)
                }
                onCommit={(rotation) =>
                  onRotate?.(selected.entityID, rotation, false)
                }
              >
                15° ↻
              </TransformStepButton>
              <output aria-live="polite">
                {Math.round((selected.rotation * 180) / Math.PI)}°
              </output>
            </div>
            <div role="group" aria-label="Stamp size">
              <span>Size</span>
              <TransformStepButton
                ariaLabel="Make stamp smaller"
                value={selected.scale}
                disabled={selected.scale <= 0.75}
                next={(scale) =>
                  Math.max(0.75, Math.round((scale - 0.1) * 10) / 10)
                }
                onPreview={(scale) => onScale?.(selected.entityID, scale, true)}
                onCommit={(scale) => onScale?.(selected.entityID, scale, false)}
              >
                −
              </TransformStepButton>
              <TransformStepButton
                ariaLabel="Make stamp larger"
                value={selected.scale}
                disabled={selected.scale >= 1.4}
                next={(scale) =>
                  Math.min(1.4, Math.round((scale + 0.1) * 10) / 10)
                }
                onPreview={(scale) => onScale?.(selected.entityID, scale, true)}
                onCommit={(scale) => onScale?.(selected.entityID, scale, false)}
              >
                +
              </TransformStepButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TransformStepButton({
  ariaLabel,
  value,
  next,
  onPreview,
  onCommit,
  disabled = false,
  children,
}: {
  ariaLabel: string;
  value: number;
  next(value: number): number;
  onPreview(value: number): void;
  onCommit(value: number): void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const currentRef = useRef(value);
  const pointerRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  }, []);

  useEffect(() => {
    if (pointerRef.current === null) currentRef.current = value;
  }, [value]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const previewStep = () => {
    currentRef.current = next(currentRef.current);
    onPreview(currentRef.current);
  };

  const finishPointer = (pointerID: number) => {
    if (pointerRef.current !== pointerID) return;
    clearTimers();
    pointerRef.current = null;
    onCommit(currentRef.current);
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || pointerRef.current !== null) return;
        event.preventDefault();
        pointerRef.current = event.pointerId;
        currentRef.current = value;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        previewStep();
        delayRef.current = window.setTimeout(() => {
          repeatRef.current = window.setInterval(previewStep, 140);
        }, 320);
      }}
      onPointerUp={(event) => finishPointer(event.pointerId)}
      onPointerCancel={(event) => finishPointer(event.pointerId)}
      onClick={(event) => {
        if (event.detail !== 0) return;
        currentRef.current = next(value);
        onCommit(currentRef.current);
      }}
    >
      {children}
    </button>
  );
}
