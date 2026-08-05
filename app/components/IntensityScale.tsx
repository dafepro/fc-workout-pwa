"use client";

const effortLabels = [
  "Super easy",
  "Easy",
  "Moderate",
  "Hard",
  "Very hard",
  "Super hard",
  "Max effort",
];
const exhaustionLabels = [
  "Not tired",
  "A little tired",
  "Somewhat tired",
  "Tired",
  "Very tired",
  "Really tired",
  "Drained",
];
const faces = ["🙂", "😊", "😌", "😮", "😓", "😣", "🥵"];

function IntensityChoice({
  name,
  title,
  value,
  labels,
  onChange,
}: {
  name: string;
  title: string;
  value: number;
  labels: string[];
  onChange: (value: number) => void;
}) {
  const selectedLabel = labels[value - 1];

  return (
    <fieldset className="intensity-choice">
      <legend>{title}</legend>
      <div className="intensity-mobile">
        <button
          type="button"
          aria-label={`Lower ${title.toLowerCase()}`}
          disabled={value === 1}
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          −
        </button>
        <output
          aria-live="polite"
          aria-label={`${selectedLabel}, ${value} of 7`}
        >
          <span aria-hidden="true">{faces[value - 1]}</span>
          <span className="sr-only">{selectedLabel}</span>
        </output>
        <button
          type="button"
          aria-label={`Raise ${title.toLowerCase()}`}
          disabled={value === 7}
          onClick={() => onChange(Math.min(7, value + 1))}
        >
          +
        </button>
      </div>
      <div className="intensity-desktop" role="radiogroup" aria-label={title}>
        {labels.map((label, index) => {
          const level = index + 1;
          return (
            <label
              key={label}
              className={value === level ? "is-selected" : ""}
              title={label}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={value === level}
                onChange={() => onChange(level)}
                aria-label={`${label}, ${level} of 7`}
              />
              <span aria-hidden="true">{faces[index]}</span>
            </label>
          );
        })}
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
        title="Effort"
        value={effort}
        labels={effortLabels}
        onChange={onEffortChange}
      />
      <IntensityChoice
        name="exhaustion"
        title="After"
        value={exhaustion}
        labels={exhaustionLabels}
        onChange={onExhaustionChange}
      />
    </section>
  );
}
