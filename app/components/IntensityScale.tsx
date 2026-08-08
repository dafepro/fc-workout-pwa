"use client";

import { copy } from "../content/copy";

const scaleAnchors = {
  effort: ["👌", "💪", "💥"],
  exhaustion: ["🙂", "😓", "🥵"],
} as const;

function IntensityChoice({
  name,
  title,
  value,
  labels,
  anchors,
  onChange,
}: {
  name: "effort" | "exhaustion";
  title: string;
  value: number;
  labels: readonly string[];
  anchors: readonly string[];
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className={`intensity-choice intensity-choice--${name}`}>
      <legend>{title}</legend>
      <div className="intensity-slider">
        <input
          type="range"
          name={name}
          min="1"
          max="7"
          step="1"
          value={value}
          aria-label={title}
          aria-valuetext={`${labels[value - 1]}, ${value} of 7`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div
          className="intensity-slider__anchors"
          data-testid={`${name}-anchors`}
          aria-hidden="true"
        >
          {anchors.map((anchor) => (
            <span key={anchor}>{anchor}</span>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

export function IntensityControls({
  effort,
  exhaustion,
  onEffortChange,
  onExhaustionChange,
}: {
  effort: number;
  exhaustion: number;
  onEffortChange: (value: number) => void;
  onExhaustionChange: (value: number) => void;
}) {
  return (
    <section className="intensity-card" aria-label="How the session felt">
      <IntensityChoice
        name="effort"
        title={copy.feelingQuestions.effort}
        value={effort}
        labels={copy.intensityValues.effort}
        anchors={scaleAnchors.effort}
        onChange={onEffortChange}
      />
      <IntensityChoice
        name="exhaustion"
        title={copy.feelingQuestions.exhaustion}
        value={exhaustion}
        labels={copy.intensityValues.exhaustion}
        anchors={scaleAnchors.exhaustion}
        onChange={onExhaustionChange}
      />
    </section>
  );
}
