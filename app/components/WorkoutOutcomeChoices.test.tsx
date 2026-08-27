import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { CompletionOutcome } from "../domain/types";
import { WorkoutOutcomeChoices } from "./WorkoutOutcomeChoices";

function Harness() {
  const [outcome, setOutcome] = useState<CompletionOutcome>("as_listed");
  return <WorkoutOutcomeChoices value={outcome} onChange={setOutcome} />;
}

describe("WorkoutOutcomeChoices", () => {
  it("offers only the three approved outcomes and exposes the selection", () => {
    render(<Harness />);

    const group = screen.getByRole("group", { name: "Did you finish?" });
    const choices = within(group).getAllByRole("button");
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Almost…",
      "Did it!",
      "Extra!",
    ]);
    expect(choices[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(choices[0]);
    expect(choices[0]).toHaveAttribute("aria-pressed", "true");
    expect(choices[1]).toHaveAttribute("aria-pressed", "false");
  });
});
