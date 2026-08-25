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
    <div
      className={className}
      role="group"
      aria-label={playerExperienceCopy.focusedToday.outcomeGroup}
    >
      {choices.map((choice) => (
        <button
          className="workout-outcome-choice"
          type="button"
          key={choice.value}
          aria-pressed={value === choice.value}
          onClick={() => onChange(choice.value)}
        >
          <Image src={choice.image} alt="" width={72} height={66} unoptimized />
          <span>{choice.label}</span>
        </button>
      ))}
    </div>
  );
}
