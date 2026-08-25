import { copy } from "../content/copy";

export const WORKOUT_NOTE_MAX_LENGTH = 500;

export function WorkoutNoteField({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  return (
    <details className="workout-note" open={value.length > 0 || undefined}>
      <summary>{copy.log.addNote}</summary>
      <label>
        <span>{copy.log.noteLabel}</span>
        <textarea
          value={value}
          maxLength={WORKOUT_NOTE_MAX_LENGTH}
          rows={3}
          placeholder={copy.log.notePlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <small>{copy.log.notePrivacy}</small>
    </details>
  );
}
