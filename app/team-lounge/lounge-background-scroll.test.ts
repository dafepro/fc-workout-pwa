import { describe, expect, it, vi } from "vitest";

import { createLoungeBackgroundScroll } from "./lounge-background-scroll";

describe("Lounge background scrolling", () => {
  it("claims below avatar movement and scrolls the page opposite the drag", () => {
    const scrollBy = vi.fn();
    const strategy = createLoungeBackgroundScroll(scrollBy);
    expect(strategy.priority).toBeLessThan(100);
    const claim = strategy.claim(sample(20));
    claim?.move?.(sample(32));
    claim?.move?.(sample(39));
    expect(scrollBy).toHaveBeenNthCalledWith(1, 0, -15);
    expect(scrollBy).toHaveBeenNthCalledWith(2, 0, -8.75);
  });

  it("continues a recent touch drag with bounded inertial scrolling", () => {
    const scrollBy = vi.fn();
    let frame: FrameRequestCallback | undefined;
    const strategy = createLoungeBackgroundScroll(scrollBy, {
      scheduler: {
        request(callback) {
          frame = callback;
          return 1;
        },
        cancel() {
          frame = undefined;
        },
      },
    });
    const claim = strategy.claim(sample(100, 0));
    claim?.move?.(sample(60, 40));
    claim?.release?.(sample(60, 45));
    expect(frame).toBeTypeOf("function");
    frame?.(61);
    const directDistance = Math.abs(scrollBy.mock.calls[0][1]);
    const inertialDistance = Math.abs(scrollBy.mock.calls[1][1]);
    expect(directDistance).toBe(50);
    expect(inertialDistance).toBeGreaterThan(10);
    expect(inertialDistance).toBeLessThan(30);
  });
});

function sample(y: number, timeStamp = y) {
  return {
    pointerId: 1,
    pointerType: "touch",
    buttons: 1,
    timeStamp,
    client: { x: 10, y },
    local: { x: 10, y },
  } as const;
}
