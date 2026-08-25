"use client";

import Image from "next/image";

import { playerExperienceCopy } from "../player/content";
import type { CompletionKind } from "../team-canvas/model";

const choices: ReadonlyArray<{
  value: CompletionKind;
  label: string;
  image: string;
}> = [
  {
    value: "partial",
    label: playerExperienceCopy.focusedToday.finishedPart,
    image: "/workouts/zoomi-almost.png",
  },
  {
    value: "goal",
    label: playerExperienceCopy.focusedToday.completedAsListed,
    image: "/workouts/zoomi-did-it.png",
  },
  {
    value: "reach",
    label: playerExperienceCopy.focusedToday.addedExtra,
    image: "/workouts/zoomi-extra.png",
  },
];

export function WorkoutOutcomeChoices({
  value,
  onChange,
  className,
}: {
  value: CompletionKind;
  onChange(value: CompletionKind): void;
  className?: string;
}) {
  return (
    <fieldset className={`workout-outcome-choices ${className ?? ""}`}>
      <legend>{playerExperienceCopy.focusedToday.finishPrompt}</legend>
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
            <span>{choice.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
