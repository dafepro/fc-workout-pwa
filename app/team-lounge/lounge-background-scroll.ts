import type { PointerInteractionStrategy } from "@canvas-physics/client";

export function createLoungeBackgroundScroll(
  scrollBy: (x: number, y: number) => void = (x, y) => window.scrollBy(x, y),
): PointerInteractionStrategy {
  return {
    id: "zoomigo.lounge.background-scroll",
    priority: 0,
    claim(initial) {
      let previousY = initial.client.y;
      return {
        kind: "background-scroll",
        move(sample) {
          const deltaY = sample.client.y - previousY;
          previousY = sample.client.y;
          if (deltaY !== 0) scrollBy(0, -deltaY);
        },
      };
    },
  };
}
