"use client";

import { useState } from "react";

import { WorkoutInstructions } from "./WorkoutInstructions";

/**
 * One choice in the picker. Deliberately not `ActivityDefinition`: the athlete
 * picks an activity and the coach picks a catalog preset, and the only thing
 * the picker needs from either is how it reads.
 */
export interface WorkoutChoice {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** Drives `.selected-activity--<accent>`; the activity id, for both callers. */
  accent?: string;
  instructions?: readonly string[];
  recommended?: boolean;
}

/**
 * The workout picker alpha 0.9 settled on: a summary of the current choice that
 * opens a bounded panel of large cards hung off its bottom edge. Extracted from
 * the athlete's log screen so the coach console shows the same object rather
 * than a second design that has to be kept in step with it.
 */
export function WorkoutSelect({
  label,
  choices,
  selectedKey,
  onSelect,
  name = "activity",
  uniform = false,
}: {
  /** The eyebrow over the current choice: "Workout" for a player, "Activity"
   * for a coach setting the team's assignment. */
  label: string;
  choices: WorkoutChoice[];
  selectedKey: string;
  onSelect: (key: string) => void;
  name?: string;
  /** Every card the same size. The athlete's picker promotes its first card to
   * full width; a list of presets has no first among equals. */
  uniform?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = choices.find((choice) => choice.key === selectedKey);
  if (!selected) return null;

  function choose(key: string) {
    onSelect(key);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={`selected-activity selected-activity--${selected.accent ?? selected.key} ${open ? "is-open" : ""}`}
        aria-label={`Selected ${label.toLowerCase()}: ${selected.name}. ${open ? "Close activity choices" : "Choose another activity"}`}
        aria-expanded={open}
        aria-controls="activity-options"
        onClick={() => setOpen((visible) => !visible)}
      >
        <span className="selected-activity__icon" aria-hidden="true">
          {selected.icon}
        </span>
        <span className="selected-activity__copy">
          <small>{label}</small>
          <strong>{selected.name}</strong>
          <small>{selected.description}</small>
        </span>
        <span className="selected-activity__chevron" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      {open ? (
        <div id="activity-options" className="activity-options">
          <fieldset className="activity-picker">
            <legend className="sr-only">{label}</legend>
            <div
              className={`activity-picker__grid ${uniform ? "activity-picker__grid--uniform" : ""}`}
            >
              {choices.map((choice) => (
                <div
                  key={choice.key}
                  className={`activity-choice ${selectedKey === choice.key ? "is-selected" : ""}`}
                >
                  <label>
                    <input
                      type="radio"
                      name={name}
                      value={choice.key}
                      checked={selectedKey === choice.key}
                      onChange={() => choose(choice.key)}
                    />
                    <span className="activity-choice__icon" aria-hidden="true">
                      {choice.icon}
                    </span>
                    <span className="activity-choice__copy">
                      <strong>{choice.name}</strong>
                      <small>{choice.description}</small>
                    </span>
                  </label>
                  {choice.recommended ? (
                    <span
                      className="activity-choice__recommended"
                      aria-label="Coach pick"
                      title="Coach pick"
                    >
                      ★
                    </span>
                  ) : null}
                  {choice.instructions ? (
                    <WorkoutInstructions
                      activityName={choice.name}
                      instructions={choice.instructions}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </>
  );
}
