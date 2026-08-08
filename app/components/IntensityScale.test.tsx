import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { IntensityControls } from "./IntensityScale";

function Harness() {
  const [effort, setEffort] = useState(4);
  const [exhaustion, setExhaustion] = useState(4);
  return (
    <IntensityControls
      effort={effort}
      exhaustion={exhaustion}
      onEffortChange={setEffort}
      onExhaustionChange={setExhaustion}
    />
  );
}

describe("combined intensity controls", () => {
  it("uses independent seven-step sliders with three visual anchors", () => {
    render(<Harness />);

    const effort = screen.getByRole("slider", {
      name: "How hard did you work?",
    });
    const tiredness = screen.getByRole("slider", {
      name: "How tired were you after?",
    });

    expect(effort).toHaveValue("4");
    expect(tiredness).toHaveValue("4");
    expect(effort).toHaveAttribute("min", "1");
    expect(effort).toHaveAttribute("max", "7");
    expect(effort).toHaveAttribute("step", "1");
    expect(screen.getByTestId("effort-anchors")).toHaveTextContent("👌💪💥");
    expect(screen.getByTestId("exhaustion-anchors")).toHaveTextContent(
      "🙂😓🥵",
    );

    fireEvent.change(effort, { target: { value: "5" } });
    fireEvent.change(tiredness, { target: { value: "3" } });

    expect(effort).toHaveValue("5");
    expect(tiredness).toHaveValue("3");
    expect(effort).toHaveAttribute("aria-valuetext", "Hard, 5 of 7");
    expect(tiredness).toHaveAttribute(
      "aria-valuetext",
      "A little tired, 3 of 7",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
