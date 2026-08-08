import type { CSSProperties } from "react";
import { copy } from "../content/copy";

function clampScaleValue(value: number): number {
  return Math.max(1, Math.min(7, value));
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
      icon: "💪",
      label: copy.feelingQuestions.effort,
      value: clampScaleValue(effort),
    },
    {
      key: "exhaustion",
      icon: "😓",
      label: copy.feelingQuestions.exhaustion,
      value: clampScaleValue(exhaustion),
    },
  ] as const;

  return (
    <div
      className={`session-feelings ${detailed ? "session-feelings--detailed" : ""}`}
      aria-label="How this session felt"
    >
      {feelings.map((feeling) => (
        <span
          className={`session-feelings__item session-feelings__item--${feeling.key}`}
          key={feeling.key}
          aria-label={`${feeling.label} ${feeling.value} of 7`}
          title={feeling.label}
        >
          <span className="session-feelings__icon" aria-hidden="true">
            {feeling.icon}
          </span>
          <span className="session-feelings__track" aria-hidden="true">
            <span
              className="session-feelings__marker"
              style={{ "--scale-value": feeling.value } as CSSProperties}
            />
          </span>
          {detailed ? <small>{feeling.label}</small> : null}
        </span>
      ))}
    </div>
  );
}
