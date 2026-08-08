import { copy } from "../content/copy";

const faces = ["😊", "🙂", "😐", "😓", "😣", "😫", "🥵"];

export function feelingFace(value: number): string {
  return faces[Math.max(1, Math.min(7, value)) - 1];
}

export function SessionFeelings({
  effort,
  exhaustion,
  detailed = false,
}: {
  effort: number;
  exhaustion: number;
  detailed?: boolean;
}) {
  const feelings = [
    {
      key: "effort",
      label: copy.feelingQuestions.effort,
      value: effort,
    },
    {
      key: "exhaustion",
      label: copy.feelingQuestions.exhaustion,
      value: exhaustion,
    },
  ];

  return (
    <div
      className={`session-feelings ${detailed ? "session-feelings--detailed" : ""}`}
      aria-label="How this session felt"
    >
      {feelings.map((feeling) => (
        <span
          className="session-feelings__item"
          key={feeling.key}
          aria-label={`${feeling.label} ${feeling.value} of 7`}
          title={feeling.label}
        >
          <span aria-hidden="true">{feelingFace(feeling.value)}</span>
          {detailed ? <small>{feeling.label}</small> : null}
        </span>
      ))}
    </div>
  );
}
