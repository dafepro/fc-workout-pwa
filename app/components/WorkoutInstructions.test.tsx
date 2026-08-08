import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkoutInstructions } from "./WorkoutInstructions";

const instructions = ["Start easy.", "Finish with a slow walk."];

afterEach(cleanup);

describe("workout instructions", () => {
  it("keeps the same toggle available while open and dismisses outside", () => {
    render(
      <WorkoutInstructions
        activityName="Distance Run"
        instructions={instructions}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "How to do Distance Run" }),
    );
    expect(
      screen.getByRole("button", { name: "Close Distance Run instructions" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("How to do Distance Run")).toBeInTheDocument();
    expect(screen.getByText("Start easy.")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByText("How to do Distance Run", { selector: "h2" }),
    ).not.toBeInTheDocument();
  });

  it("dismisses the open panel after a swipe gesture", () => {
    render(
      <WorkoutInstructions
        activityName="Distance Run"
        instructions={instructions}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "How to do Distance Run" }),
    );
    const panel = screen.getByText("How to do Distance Run", {
      selector: "h2",
    }).parentElement!.parentElement!;

    fireEvent.touchStart(panel, {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    fireEvent.touchEnd(panel, {
      changedTouches: [{ clientX: 70, clientY: 10 }],
    });

    expect(
      screen.queryByText("How to do Distance Run", { selector: "h2" }),
    ).not.toBeInTheDocument();
  });
});
