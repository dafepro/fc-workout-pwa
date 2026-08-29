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
    expect(scrollBy).toHaveBeenNthCalledWith(1, 0, -12);
    expect(scrollBy).toHaveBeenNthCalledWith(2, 0, -7);
  });
});

function sample(y: number) {
  return {
    pointerId: 1,
    pointerType: "touch",
    buttons: 1,
    timeStamp: y,
    client: { x: 10, y },
    local: { x: 10, y },
  } as const;
}
