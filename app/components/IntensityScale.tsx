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
const faces = ["🙂", "🙂", "😌", "😮", "😓", "😣", "🥵"];

export function IntensityScale({
  name,
  value,
  onChange,
  kind,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
  kind: "effort" | "exhaustion";
}) {
  const labels = kind === "effort" ? effortLabels : exhaustionLabels;
  const title =
    kind === "effort" ? "Effort during activity" : "Exhaustion after";
  return (
    <fieldset className="scale-card">
      <legend>{title}</legend>
      <p className="scale-card__hint">Choose the face that fits best.</p>
      <div className="scale" data-testid={`${kind}-scale`}>
        {labels.map((label, index) => {
          const level = index + 1;
          return (
            <label
              className={`scale__option scale__option--${level} ${value === level ? "is-selected" : ""}`}
              key={label}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={value === level}
                onChange={() => onChange(level)}
              />
              <span className="scale__face" aria-hidden="true">
                {faces[index]}
              </span>
              <span className="scale__number">{level}</span>
              <span className="scale__label">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
