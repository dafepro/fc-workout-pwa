import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityId } from "../domain/types";
import { ActivitySelector, ActivitySpecificFields } from "./ActivityFields";
import { activities } from "../data/mockData";

afterEach(cleanup);

function Harness() {
  const [activity, setActivity] = useState<ActivityId>("hill-sprints");
  const [value, setValue] = useState(8);
  return (
    <>
      <ActivitySelector
        selected={activity}
        onSelect={setActivity}
        activities={activities}
      />
      <ActivitySpecificFields
        activityId={activity}
        value={value}
        onChange={setValue}
        activities={activities}
      />
    </>
  );
}

describe("activity-specific form", () => {
  it("shows activity instructions and changes the structured result field", () => {
    render(<Harness />);
    expect(screen.getByText("Reps completed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How to do Hill Sprints" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /^Distance Run/i }));
    expect(screen.getByLabelText("Distance completed")).toHaveAttribute(
      "step",
      "0.25",
    );
    expect(screen.getByText("miles")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How to do Distance Run" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /^Recovery Walk/i }));
    expect(screen.getByLabelText("Elapsed minutes")).toHaveAttribute(
      "max",
      "90",
    );
  });

  it("offers direct entry and bounded steppers for every activity kind", async () => {
    render(<Harness />);

    const repetitions = screen.getByLabelText("Reps completed");
    expect(repetitions).toHaveValue(8);
    fireEvent.click(screen.getByRole("button", { name: "Add 1 rep" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Reps completed")).toHaveValue(9),
    );

    fireEvent.click(screen.getByRole("radio", { name: /^Distance Run/i }));
    const distance = screen.getByLabelText("Distance completed");
    fireEvent.change(distance, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 0.25 miles" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Distance completed")).toHaveValue(1.25),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove 0.25 miles" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Distance completed")).toHaveValue(1),
    );
  });
});
