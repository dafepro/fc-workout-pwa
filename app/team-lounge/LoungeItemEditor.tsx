"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { TeamLoungeItemTransform } from "./lounge-gateway";
import {
  clampLoungeItemScale,
  nextLoungeItemRotation,
} from "./lounge-editor-geometry";
import type { LoungeItemChoice } from "./lounge-items";
import { LoungeItemArt } from "./LoungeItemArt";

export interface LoungeEditableItem {
  entityID: string;
  label: string;
  glyph: string;
  imageSrc?: string;
  kind: LoungeItemChoice["kind"];
  editable: boolean;
  owner: "current" | "teammate";
  itemRevision: number;
  screen: Readonly<{ x: number; y: number }>;
  transform: TeamLoungeItemTransform;
}

interface DragState {
  item: LoungeEditableItem;
  pointerID: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  moved: boolean;
  overTrash: boolean;
}

interface TapState {
  entityID: string;
  pointerID: number;
  start: { x: number; y: number };
  moved: boolean;
}

export function LoungeItemEditor({
  items,
  paintArtwork = true,
  selectedEntityID,
  pending,
  dragging,
  trashTargetRef,
  onSelect,
  onMove,
  onRotate,
  onScale,
  onDelete,
  onFinish,
  onDragStateChange,
}: {
  items: readonly LoungeEditableItem[];
  paintArtwork?: boolean;
  selectedEntityID: string | null;
  pending: boolean;
  dragging: { entityID: string; overTrash: boolean } | null;
  trashTargetRef?: RefObject<HTMLElement | null>;
  onSelect(item: LoungeEditableItem): void;
  onMove(
    item: LoungeEditableItem,
    screen: Readonly<{ x: number; y: number }>,
  ): void;
  onRotate(item: LoungeEditableItem, rotation: number): void;
  onScale(item: LoungeEditableItem, scale: number): void;
  onDelete(item: LoungeEditableItem): void;
  onFinish(): void;
  onDragStateChange(
    state: { entityID: string; overTrash: boolean } | null,
  ): void;
}) {
  const dragRef = useRef<DragState | null>(null);
  const tapRef = useRef<TapState | null>(null);
  const suppressedClickRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<DragState | null>(null);
  const selected = items.find(({ entityID }) => entityID === selectedEntityID);
  const selectedScreen = selected
    ? preview?.item.entityID === selected.entityID
      ? {
          x: selected.screen.x + preview.current.x - preview.start.x,
          y: selected.screen.y + preview.current.y - preview.start.y,
        }
      : selected.screen
    : undefined;

  useEffect(() => {
    const overTrash = (event: PointerEvent) => {
      const target = trashTargetRef?.current;
      if (!target) return false;
      const bounds = target.getBoundingClientRect();
      return (
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      );
    };
    const move = (event: PointerEvent) => {
      const tap = tapRef.current;
      if (tap?.pointerID === event.pointerId) {
        tap.moved ||=
          Math.hypot(
            event.clientX - tap.start.x,
            event.clientY - tap.start.y,
          ) >= 3;
      }
      const active = dragRef.current;
      if (!active || active.pointerID !== event.pointerId) return;
      active.current = { x: event.clientX, y: event.clientY };
      active.moved ||=
        Math.hypot(
          event.clientX - active.start.x,
          event.clientY - active.start.y,
        ) >= 3;
      active.overTrash = overTrash(event);
      setPreview({ ...active });
      onDragStateChange({
        entityID: active.item.entityID,
        overTrash: active.overTrash,
      });
    };
    const finish = (event: PointerEvent) => {
      const tap = tapRef.current;
      if (tap?.pointerID === event.pointerId) {
        if (tap.moved || event.type === "pointercancel") {
          suppressedClickRef.current = tap.entityID;
        }
        tapRef.current = null;
      }
      const active = dragRef.current;
      if (!active || active.pointerID !== event.pointerId) return;
      active.current = { x: event.clientX, y: event.clientY };
      const droppingOnTrash = overTrash(event);
      dragRef.current = null;
      setPreview(null);
      onDragStateChange(null);
      if (event.type === "pointercancel" || !active.moved) return;
      if (droppingOnTrash) {
        onDelete(active.item);
      } else {
        onMove(active.item, {
          x: active.item.screen.x + active.current.x - active.start.x,
          y: active.item.screen.y + active.current.y - active.start.y,
        });
      }
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
    return () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
    };
  }, [onDelete, onDragStateChange, onMove, trashTargetRef]);

  return (
    <div className="team-lounge__item-overlays" aria-live="polite">
      {items.map((item) => {
        const active =
          preview?.item.entityID === item.entityID ? preview : null;
        const screen = active
          ? {
              x: item.screen.x + active.current.x - active.start.x,
              y: item.screen.y + active.current.y - active.start.y,
            }
          : item.screen;
        const selectedItem = item.entityID === selectedEntityID;
        const category = item.kind === "lounge_prop" ? "item" : "stamp";
        const style = {
          transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%) rotate(${item.transform.rotation}rad) scale(${item.transform.scale})`,
        } as CSSProperties;
        const label = item.editable
          ? `${item.label} ${category}, yours; ${selectedItem ? "drag to move" : "tap to edit"}`
          : item.owner === "current"
            ? `${item.label} ${category}, yours; locked from an earlier day`
            : `${item.label} ${category} placed by a teammate`;
        return item.editable ? (
          <button
            key={item.entityID}
            type="button"
            className={`team-lounge__placed-item team-lounge__placed-item--${category} team-lounge__placed-item--editable${selectedItem ? " team-lounge__placed-item--selected" : ""}`}
            style={style}
            aria-label={label}
            aria-pressed={selectedItem}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressedClickRef.current === item.entityID) {
                suppressedClickRef.current = null;
                return;
              }
              onSelect(item);
            }}
            onPointerDown={(event) => {
              if (!selectedItem) {
                if (suppressedClickRef.current === item.entityID) {
                  suppressedClickRef.current = null;
                }
                tapRef.current = {
                  entityID: item.entityID,
                  pointerID: event.pointerId,
                  start: { x: event.clientX, y: event.clientY },
                  moved: false,
                };
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const next: DragState = {
                item,
                pointerID: event.pointerId,
                start: { x: event.clientX, y: event.clientY },
                current: { x: event.clientX, y: event.clientY },
                moved: false,
                overTrash: false,
              };
              dragRef.current = next;
              setPreview(next);
              onDragStateChange({ entityID: item.entityID, overTrash: false });
            }}
          >
            {paintArtwork ? <LoungeItemArt item={item} decorative /> : null}
          </button>
        ) : (
          <span
            key={item.entityID}
            className={`team-lounge__placed-item team-lounge__placed-item--${category}`}
            style={style}
            role="img"
            aria-label={label}
          >
            {paintArtwork ? <LoungeItemArt item={item} decorative /> : null}
          </span>
        );
      })}
      {selected && selectedScreen ? (
        <div
          className="team-lounge__item-editor"
          role="group"
          aria-label={`Edit selected ${selected.kind === "lounge_prop" ? "item" : "stamp"}`}
          data-layout="radial"
          data-dragging={dragging?.entityID === selected.entityID || undefined}
          data-canvas-pointer-ignore="true"
          style={
            {
              "--editor-x": `${selectedScreen.x}px`,
              "--editor-y": `${selectedScreen.y}px`,
            } as CSSProperties
          }
        >
          <span className="team-lounge__item-editor-ring" aria-hidden="true" />
          <div
            role="group"
            aria-label={`${titleCase(selected.kind === "lounge_prop" ? "item" : "stamp")} size`}
          >
            <button
              type="button"
              className="team-lounge__item-editor-control team-lounge__item-editor-control--smaller"
              aria-label={`Make ${selected.kind === "lounge_prop" ? "item" : "stamp"} smaller`}
              disabled={pending || selected.transform.scale <= 0.75}
              onClick={() =>
                onScale(
                  selected,
                  clampLoungeItemScale(selected.transform.scale - 0.1),
                )
              }
            >
              −
            </button>
            <button
              type="button"
              className="team-lounge__item-editor-control team-lounge__item-editor-control--larger"
              aria-label={`Make ${selected.kind === "lounge_prop" ? "item" : "stamp"} larger`}
              disabled={pending || selected.transform.scale >= 1.4}
              onClick={() =>
                onScale(
                  selected,
                  clampLoungeItemScale(selected.transform.scale + 0.1),
                )
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="team-lounge__item-editor-control team-lounge__item-editor-control--rotate-left"
            aria-label={`Rotate ${selected.kind === "lounge_prop" ? "item" : "stamp"} left 15 degrees`}
            disabled={pending}
            onClick={() =>
              onRotate(
                selected,
                nextLoungeItemRotation(selected.transform.rotation, -1),
              )
            }
          >
            ↺
          </button>
          <button
            type="button"
            className="team-lounge__item-editor-control team-lounge__item-editor-control--rotate-right"
            aria-label={`Rotate ${selected.kind === "lounge_prop" ? "item" : "stamp"} right 15 degrees`}
            disabled={pending}
            onClick={() =>
              onRotate(
                selected,
                nextLoungeItemRotation(selected.transform.rotation, 1),
              )
            }
          >
            ↻
          </button>
          <button
            type="button"
            className="team-lounge__item-editor-control team-lounge__item-editor-control--finish"
            aria-label="Finish editing"
            disabled={pending}
            onClick={onFinish}
          >
            ✓
          </button>
        </div>
      ) : null}
    </div>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
