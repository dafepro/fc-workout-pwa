"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

// How far a finger must travel before its direction is treated as deliberate.
const INTENT_PX = 8;

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  abandoned: boolean;
};

/**
 * A range input whose pointer handling is owned by the wrapper rather than the
 * browser. A native range jumps to the touched position the moment a finger
 * lands, so scrolling a form with a thumb over one silently rewrites its value.
 * Here the input is inert to pointers and the wrapper commits a change only
 * once a gesture has proven itself horizontal, or turns out to be a still tap.
 * The input itself remains the accessible, keyboard-operable control.
 */
export function RangeSlider({
  name,
  label,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
  className,
  children,
}: {
  name: string;
  label: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);

  function valueAt(clientX: number): number {
    const track = inputRef.current?.getBoundingClientRect();
    if (!track?.width) return value;
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - track.left) / track.width),
    );
    return Math.min(max, min + Math.round((ratio * (max - min)) / step) * step);
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      abandoned: false,
    };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || active.abandoned) {
      return;
    }
    if (!active.dragging) {
      const travelX = Math.abs(event.clientX - active.startX);
      const travelY = Math.abs(event.clientY - active.startY);
      if (travelY > travelX && travelY > INTENT_PX) {
        active.abandoned = true; // a scroll passing through, not a slide
        return;
      }
      if (travelX <= INTENT_PX) return;
      active.dragging = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    onChange(valueAt(event.clientX));
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    gesture.current = null;
    if (!active || active.pointerId !== event.pointerId || active.abandoned) {
      return;
    }
    if (active.dragging) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      return;
    }
    const stillATap =
      Math.abs(event.clientX - active.startX) <= INTENT_PX &&
      Math.abs(event.clientY - active.startY) <= INTENT_PX;
    if (stillATap) onChange(valueAt(event.clientX));
  }

  return (
    <div
      className={`range-slider ${className ?? ""}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => (gesture.current = null)}
    >
      <input
        ref={inputRef}
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {children}
    </div>
  );
}
