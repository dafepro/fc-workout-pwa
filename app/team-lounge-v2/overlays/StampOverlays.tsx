import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  StampAssetView,
  stampAssetLabel,
} from "../../team-canvas/components/StampAsset";
import type { StampAsset } from "../../team-canvas/model";
import { nextLoungeStampRotation } from "../placement/orientation";
import { layoutStampEditor, type EditorRect } from "./stamp-editor-layout";

export interface LoungeStampOverlay {
  entityID: string;
  asset: StampAsset;
  category?: "stamp" | "prop";
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
  draggingEntityID = null,
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
  draggingEntityID?: string | null;
  onPlace(screen: Readonly<{ x: number; y: number }>): void;
  onSelect?(entityID: string): void;
  onScale?(entityID: string, scale: number, preview: boolean): void;
  onRotate?(entityID: string, rotation: number, preview: boolean): void;
  onDone?(): void;
}) {
  const editingChromeVisible = draggingEntityID === null;
  const selected = editingChromeVisible
    ? stamps.find(({ entityID }) => entityID === selectedEntityID)
    : undefined;
  const selectedCategory = selected?.category ?? "stamp";
  const [moreActionsEntityID, setMoreActionsEntityID] = useState<string | null>(
    null,
  );
  const moreActionsOpen = selected?.entityID === moreActionsEntityID;
  const editable = new Set(editableEntityIDs);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 320, height: 480 });
  const [ghostPoint, setGhostPoint] = useState<{
    assetID: string;
    x: number;
    y: number;
  } | null>(null);
  const activeGhostPoint =
    ghostPoint?.assetID === selectedStamp?.id ? ghostPoint : null;
  const editorLayout = selected
    ? layoutStampEditor(
        selected.screen,
        surfaceSize,
        Math.max(24, 27 * selected.scale),
      )
    : null;

  useEffect(() => {
    const surface = overlayRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      setSurfaceSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const updateGhostPoint = (
    surface: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    const bounds = surface.getBoundingClientRect();
    const point = {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
    setGhostPoint({ assetID: selectedStamp?.id ?? "", ...point });
    return point;
  };
  return (
    <div
      ref={overlayRef}
      className="team-lounge-v2__stamp-overlays"
      aria-live="polite"
    >
      {stamps.map(
        ({
          entityID,
          asset,
          category = "stamp",
          ownerUserID,
          rotation,
          screen,
          scale,
        }) => {
          const canEdit = editable.has(entityID);
          const isSelected = entityID === selectedEntityID;
          const showEditableChrome = canEdit && editingChromeVisible;
          const className = `team-lounge-v2__placed-stamp${showEditableChrome ? " team-lounge-v2__placed-stamp--editable" : ""}${isSelected && editingChromeVisible ? " team-lounge-v2__placed-stamp--selected" : ""}`;
          const style = {
            transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%) rotate(${rotation}rad) scale(${scale})`,
            "--stamp-counter-rotation": `${-rotation}rad`,
          } as CSSProperties;
          const itemType = category === "prop" ? "prop" : "stamp";
          const label = canEdit
            ? `${stampAssetLabel(asset)} ${itemType}, yours; tap then drag to move`
            : ownerUserID === currentPlayerID
              ? `${stampAssetLabel(asset)} ${itemType}, yours; locked from an earlier day`
              : `${stampAssetLabel(asset)} ${itemType} placed by a teammate`;
          return canEdit ? (
            <button
              key={entityID}
              className={className}
              style={style}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              onPointerDownCapture={(event) => {
                event.preventDefault();
                setMoreActionsEntityID(null);
                if (isSelected) {
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  return;
                }
                event.stopPropagation();
                onSelect?.(entityID);
              }}
              onClick={(event) => {
                if (event.detail === 0) onSelect?.(entityID);
              }}
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
          onPointerDown={(event) =>
            updateGhostPoint(event.currentTarget, event.clientX, event.clientY)
          }
          onPointerMove={(event) =>
            updateGhostPoint(event.currentTarget, event.clientX, event.clientY)
          }
          onClick={(event) => {
            onPlace(
              updateGhostPoint(
                event.currentTarget,
                event.clientX,
                event.clientY,
              ),
            );
          }}
        >
          <span>Tap where you want it</span>
          <span
            className="team-lounge-v2__placement-ghost"
            aria-hidden="true"
            style={
              activeGhostPoint
                ? {
                    left: `${activeGhostPoint.x}px`,
                    top: `${activeGhostPoint.y}px`,
                  }
                : { left: "50%", top: "55%" }
            }
          >
            <StampAssetView asset={selectedStamp} />
          </span>
        </button>
      ) : null}
      {selected && editorLayout ? (
        <div
          className="team-lounge-v2__stamp-editor"
          role="group"
          aria-label={`Edit selected ${selectedCategory}`}
          data-canvas-pointer-ignore="true"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!moreActionsOpen && selectedCategory === "stamp" ? (
            <>
              <div
                className="team-lounge-v2__stamp-editor-size"
                style={rectStyle(editorLayout.size)}
                role="group"
                aria-label="Stamp size"
                data-editor-control="true"
              >
                <TransformStepButton
                  ariaLabel="Make stamp smaller"
                  value={selected.scale}
                  disabled={selected.scale <= 0.75}
                  next={(scale) =>
                    Math.max(0.75, Math.round((scale - 0.1) * 10) / 10)
                  }
                  onPreview={(scale) =>
                    onScale?.(selected.entityID, scale, true)
                  }
                  onCommit={(scale) =>
                    onScale?.(selected.entityID, scale, false)
                  }
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
                  onPreview={(scale) =>
                    onScale?.(selected.entityID, scale, true)
                  }
                  onCommit={(scale) =>
                    onScale?.(selected.entityID, scale, false)
                  }
                >
                  +
                </TransformStepButton>
              </div>
              <div
                className="team-lounge-v2__stamp-editor-rotation"
                role="group"
                aria-label="Stamp rotation"
              >
                <TransformStepButton
                  className="team-lounge-v2__stamp-editor-rotate"
                  style={rectStyle(editorLayout.rotateLeft)}
                  dataEditorControl
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
                  ↺
                </TransformStepButton>
                <TransformStepButton
                  className="team-lounge-v2__stamp-editor-rotate"
                  style={rectStyle(editorLayout.rotateRight)}
                  dataEditorControl
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
                  ↻
                </TransformStepButton>
              </div>
            </>
          ) : null}
          <div
            className="team-lounge-v2__stamp-editor-bottom"
            style={rectStyle(editorLayout.more)}
            data-editor-control="true"
          >
            <button
              className="team-lounge-v2__stamp-editor-more"
              type="button"
              aria-label={`More ${selectedCategory} actions`}
              aria-expanded={moreActionsOpen}
              aria-haspopup="menu"
              onClick={() =>
                setMoreActionsEntityID((entityID) =>
                  entityID === selected.entityID ? null : selected.entityID,
                )
              }
            >
              •••
            </button>
          </div>
          {moreActionsOpen ? (
            <div
              className="team-lounge-v2__stamp-editor-menu"
              style={rectStyle(editorLayout.menu)}
              role="menu"
              aria-label={`More ${selectedCategory} actions`}
            >
              {selectedCategory === "stamp" ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-label="Reset stamp appearance"
                  disabled={selected.rotation === 0 && selected.scale === 1}
                  onClick={() => {
                    onRotate?.(selected.entityID, 0, false);
                    onScale?.(selected.entityID, 1, false);
                    setMoreActionsEntityID(null);
                  }}
                >
                  Reset appearance
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreActionsEntityID(null);
                  onDone?.();
                }}
              >
                Finish editing
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TransformStepButton({
  className,
  style,
  dataEditorControl = false,
  ariaLabel,
  value,
  next,
  onPreview,
  onCommit,
  disabled = false,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  dataEditorControl?: boolean;
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
      className={className}
      style={style}
      data-editor-control={dataEditorControl ? "true" : undefined}
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

function rectStyle(rect: EditorRect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}
