"use client";

import Image from "next/image";
import { copy } from "../content/copy";
import type { CompletionOutcome } from "../domain/types";

const choices: ReadonlyArray<{
  value: CompletionOutcome;
  image: string;
}> = [
  { value: "partial", image: "/workouts/zoomi-almost.png" },
  { value: "as_listed", image: "/workouts/zoomi-did-it.png" },
  { value: "extra", image: "/workouts/zoomi-extra.png" },
];

export function WorkoutOutcomeChoices({
  value,
  onChange,
}: {
  value: CompletionOutcome;
  onChange(value: CompletionOutcome): void;
}) {
  return (
    <fieldset className="field-card workout-outcome-choices">
      <legend>{copy.log.outcomePrompt}</legend>
      <div className="workout-outcome-choices__options">
        {choices.map((choice) => (
          <button
            className="workout-outcome-choice"
            type="button"
            key={choice.value}
            data-outcome={choice.value}
            aria-pressed={value === choice.value}
            onClick={() => onChange(choice.value)}
          >
            <span className="workout-outcome-choice__image-frame">
              <Image
                className="workout-outcome-choice__image"
                src={choice.image}
                alt=""
                width={80}
                height={80}
                unoptimized
              />
            </span>
            <span>{copy.log.outcomes[choice.value]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
