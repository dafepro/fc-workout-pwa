import { teamCanvasCopy } from "../content";

export function FeelTracks({
  effort,
  tiredness,
  onEffortChange,
  onTirednessChange,
}: {
  effort: number;
  tiredness: number;
  onEffortChange(value: number): void;
  onTirednessChange(value: number): void;
}) {
  const copy = teamCanvasCopy.today.feel;

  return (
    <fieldset className="tc-feel-tracks">
      <legend>{copy.title}</legend>
      <FeelTrack
        name="Effort"
        value={effort}
        labels={copy.effort}
        low={copy.effortLow}
        high={copy.effortHigh}
        onChange={onEffortChange}
      />
      <FeelTrack
        name="Tiredness"
        value={tiredness}
        labels={copy.tiredness}
        low={copy.tirednessLow}
        high={copy.tirednessHigh}
        onChange={onTirednessChange}
      />
    </fieldset>
  );
}

function FeelTrack({
  name,
  value,
  labels,
  low,
  high,
  onChange,
}: {
  name: string;
  value: number;
  labels: readonly string[];
  low: string;
  high: string;
  onChange(value: number): void;
}) {
  return (
    <label className="tc-feel-track">
      <span className="tc-feel-track__heading">
        <strong>{name}</strong>
        <output>{labels[value - 1]}</output>
      </span>
      <input
        type="range"
        min="1"
        max="7"
        step="1"
        value={value}
        aria-label={name}
        aria-valuetext={labels[value - 1]}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="tc-feel-track__ends" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );
}
