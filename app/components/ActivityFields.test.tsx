import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ActivityId } from "../domain/types";
import { ActivitySelector, ActivitySpecificFields } from "./ActivityFields";

function Harness() {
  const [activity, setActivity] = useState<ActivityId>("hill-sprints");
  const [value, setValue] = useState(8);
  return (
    <>
      <ActivitySelector selected={activity} onSelect={setActivity} />
      <ActivitySpecificFields
        activityId={activity}
        value={value}
        onChange={setValue}
      />
    </>
  );
}

describe("activity-specific form", () => {
  it("changes the structured result field when a different activity is selected", () => {
    render(<Harness />);
    expect(screen.getByText("Reps completed")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Distance Run/i));
    expect(screen.getByLabelText("Distance completed")).toHaveAttribute(
      "step",
      "0.1",
    );
    expect(screen.getByText("miles")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Recovery Walk/i));
    expect(screen.getByLabelText("Elapsed minutes")).toHaveAttribute(
      "max",
      "90",
    );
  });
});
