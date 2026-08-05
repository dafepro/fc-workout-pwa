"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "../content/copy";

export function WorkoutInstructions() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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
          open ? "Close Hill Sprints instructions" : "How to do Hill Sprints"
        }
        aria-expanded={open}
        aria-controls="hill-sprint-instructions"
        onClick={() => setOpen((visible) => !visible)}
      >
        i
      </button>
      {open ? (
        <div
          className="workout-instructions__panel"
          id="hill-sprint-instructions"
        >
          <h2>How to do Hill Sprints</h2>
          <ol>
            {copy.hillSprintInstructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
