import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { feelingFace, SessionFeelings } from "./SessionFeelings";

describe("session feelings", () => {
  it("keeps effort and exhaustion visible as separate emoji values", () => {
    render(<SessionFeelings effort={2} exhaustion={6} />);

    expect(
      screen.getByLabelText("How hard did you work? 2 of 7"),
    ).toHaveTextContent("🙂");
    expect(
      screen.getByLabelText("How tired were you after? 6 of 7"),
    ).toHaveTextContent("😫");
  });

  it("clamps unexpected values to the supported seven faces", () => {
    expect(feelingFace(0)).toBe("😊");
    expect(feelingFace(8)).toBe("🥵");
  });
});
