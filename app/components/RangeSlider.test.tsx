import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RangeSlider } from "./RangeSlider";

// 1..7 across 700px puts each step 100px apart, so positions map to whole steps.
const TRACK = { left: 0, width: 700 };

function Harness() {
  const [value, setValue] = useState(4);
  return (
    <RangeSlider
      name="effort"
      label="How hard did you work?"
      valueText={`${value} of 7`}
      min={1}
      max={7}
      step={1}
      value={value}
      onChange={setValue}
    />
  );
}

function renderSlider() {
  render(<Harness />);
  const input = screen.getByRole("slider");
  input.getBoundingClientRect = () =>
    ({ left: TRACK.left, width: TRACK.width }) as DOMRect;
  return { input, track: input.parentElement as HTMLElement };
}

function touch(clientX: number, clientY: number) {
  return { pointerId: 1, pointerType: "touch", clientX, clientY };
}

describe("range slider", () => {
  it("ignores a vertical drag so the page can scroll under a thumb", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(350, 100));
    fireEvent.pointerMove(track, touch(356, 160));
    fireEvent.pointerMove(track, touch(420, 300));
    fireEvent.pointerUp(track, touch(420, 300));

    expect(input).toHaveValue("4");
  });

  it("ignores a drag the browser takes over for scrolling", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(350, 100));
    fireEvent.pointerCancel(track, touch(350, 140));
    fireEvent.pointerUp(track, touch(700, 140));

    expect(input).toHaveValue("4");
  });

  it("tracks a horizontal drag", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(350, 100));
    fireEvent.pointerMove(track, touch(500, 104));
    expect(input).toHaveValue("5");

    fireEvent.pointerMove(track, touch(700, 108));
    fireEvent.pointerUp(track, touch(700, 108));
    expect(input).toHaveValue("7");
  });

  it("does not move on a touch that never travels far enough to be a drag", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(350, 100));
    fireEvent.pointerMove(track, touch(354, 103));
    fireEvent.pointerUp(track, touch(354, 103));

    expect(input).toHaveValue("4");
  });

  it("sets the value from a deliberate tap", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(700, 100));
    fireEvent.pointerUp(track, touch(700, 100));

    expect(input).toHaveValue("7");
  });

  it("clamps positions past either end of the track", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(-400, 100));
    fireEvent.pointerUp(track, touch(-400, 100));
    expect(input).toHaveValue("1");

    fireEvent.pointerDown(track, touch(1200, 100));
    fireEvent.pointerUp(track, touch(1200, 100));
    expect(input).toHaveValue("7");
  });

  it("keeps a drag it has already grabbed when the finger wanders vertically", () => {
    const { input, track } = renderSlider();

    fireEvent.pointerDown(track, touch(350, 100));
    fireEvent.pointerMove(track, touch(500, 100));
    fireEvent.pointerMove(track, touch(700, 400));
    fireEvent.pointerUp(track, touch(700, 400));

    expect(input).toHaveValue("7");
  });

  it("still exposes a native range input for keyboard and assistive tech", () => {
    const { input } = renderSlider();

    expect(input).toHaveAttribute("type", "range");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "7");
    expect(input).toHaveAttribute("step", "1");
    expect(input).toHaveAttribute("aria-valuetext", "4 of 7");

    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveValue("2");
  });
});
