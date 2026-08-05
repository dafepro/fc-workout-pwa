import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkoutInstructions } from "./WorkoutInstructions";

afterEach(cleanup);

describe("workout instructions", () => {
  it("keeps the same toggle available while open and dismisses outside", () => {
    render(<WorkoutInstructions />);

    fireEvent.click(
      screen.getByRole("button", { name: "How to do Hill Sprints" }),
    );
    expect(
      screen.getByRole("button", { name: "Close Hill Sprints instructions" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("How to do Hill Sprints")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByText("How to do Hill Sprints", { selector: "h2" }),
    ).not.toBeInTheDocument();
  });

  it("dismisses the open panel after a swipe gesture", () => {
    render(<WorkoutInstructions />);
    fireEvent.click(
      screen.getByRole("button", { name: "How to do Hill Sprints" }),
    );
    const instructions = screen.getByText("How to do Hill Sprints", {
      selector: "h2",
    }).parentElement!.parentElement!;

    fireEvent.touchStart(instructions, {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    fireEvent.touchEnd(instructions, {
      changedTouches: [{ clientX: 70, clientY: 10 }],
    });

    expect(
      screen.queryByText("How to do Hill Sprints", { selector: "h2" }),
    ).not.toBeInTheDocument();
  });
});
