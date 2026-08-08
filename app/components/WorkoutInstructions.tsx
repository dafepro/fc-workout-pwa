"use client";

import { useEffect, useRef, useState } from "react";
export function WorkoutInstructions({
  activityName,
  instructions,
}: {
  activityName: string;
  instructions: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const panelId = `${activityName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-instructions`;

  useEffect(() => {
    if (!open) return;

    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("focusin", dismissOutside);
    window.addEventListener("keydown", dismissWithEscape);
    return () => {
      window.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("focusin", dismissOutside);
      window.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return (
    <div
      className={`workout-instructions ${open ? "is-open" : ""}`}
      ref={containerRef}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        const touch = event.changedTouches[0];
        touchStartRef.current = null;
        if (
          start &&
          (Math.abs(touch.clientX - start.x) > 40 ||
            Math.abs(touch.clientY - start.y) > 40)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        className="workout-instructions__toggle"
        type="button"
        aria-label={
          open
            ? `Close ${activityName} instructions`
            : `How to do ${activityName}`
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((visible) => !visible)}
      >
        i
      </button>
      {open ? (
        <div className="workout-instructions__panel" id={panelId}>
          <h2>How to do {activityName}</h2>
          <ol>
            {instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
