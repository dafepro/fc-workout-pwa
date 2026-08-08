import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionFeelings } from "./SessionFeelings";

describe("session feelings", () => {
  it("shows effort and tiredness as separate positions on compact scales", () => {
    render(<SessionFeelings effort={2} exhaustion={6} />);

    const effort = screen.getByLabelText("How hard did you work? 2 of 7");
    const tiredness = screen.getByLabelText("How tired were you after? 6 of 7");

    expect(effort).toHaveTextContent("💪");
    expect(tiredness).toHaveTextContent("😓");
    expect(effort.querySelector(".session-feelings__marker")).toHaveStyle({
      "--scale-value": "2",
    });
    expect(tiredness.querySelector(".session-feelings__marker")).toHaveStyle({
      "--scale-value": "6",
    });
  });

  it("clamps unexpected values to the supported scale", () => {
    render(<SessionFeelings effort={0} exhaustion={8} />);

    expect(
      screen
        .getByLabelText("How hard did you work? 1 of 7")
        .querySelector(".session-feelings__marker"),
    ).toHaveStyle({ "--scale-value": "1" });
    expect(
      screen
        .getByLabelText("How tired were you after? 7 of 7")
        .querySelector(".session-feelings__marker"),
    ).toHaveStyle({ "--scale-value": "7" });
  });
});
