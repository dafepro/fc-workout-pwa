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
  it("keeps effort and exhaustion as independent seven-step scalar values", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Raise effort" }));
    expect(
      screen.getByRole("status", { name: "Very hard, 5 of 7" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lower after" }));
    expect(
      screen.getByRole("status", { name: "Somewhat tired, 3 of 7" }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("radio")).toHaveLength(14);
  });
});
