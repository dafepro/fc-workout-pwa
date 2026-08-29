import type { PointerInteractionStrategy } from "@canvas-physics/client";

interface ScrollFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(frame: number): void;
}

interface LoungeBackgroundScrollOptions {
  scheduler?: ScrollFrameScheduler;
}

const movementGain = 1.25;
const maximumVelocity = 2.5;
const minimumVelocity = 0.04;
const momentumDecayPerFrame = 0.86;

export function createLoungeBackgroundScroll(
  scrollBy: (x: number, y: number) => void = (x, y) => window.scrollBy(x, y),
  options: LoungeBackgroundScrollOptions = {},
): PointerInteractionStrategy {
  const scheduler = options.scheduler ?? {
    request: (callback: FrameRequestCallback) =>
      requestAnimationFrame(callback),
    cancel: (frame: number) => cancelAnimationFrame(frame),
  };
  let momentumFrame: number | undefined;

  const stopMomentum = () => {
    if (momentumFrame === undefined) return;
    scheduler.cancel(momentumFrame);
    momentumFrame = undefined;
  };

  return {
    id: "zoomigo.lounge.background-scroll",
    priority: 0,
    claim(initial) {
      stopMomentum();
      let previousY = initial.client.y;
      let previousAt = initial.timeStamp;
      let lastMoveAt = initial.timeStamp;
      let velocity = 0;
      return {
        kind: "background-scroll",
        move(sample) {
          const deltaY = sample.client.y - previousY;
          const elapsed = Math.max(1, sample.timeStamp - previousAt);
          previousY = sample.client.y;
          previousAt = sample.timeStamp;
          if (deltaY === 0) return;
          const distance = -deltaY * movementGain;
          velocity = Math.max(
            -maximumVelocity,
            Math.min(maximumVelocity, distance / elapsed),
          );
          lastMoveAt = sample.timeStamp;
          scrollBy(0, distance);
        },
        release(sample) {
          if (
            initial.pointerType !== "touch" ||
            sample.timeStamp - lastMoveAt > 80 ||
            Math.abs(velocity) < minimumVelocity
          ) {
            return;
          }
          let previousFrameAt = sample.timeStamp;
          const continueMomentum = (frameAt: number) => {
            const elapsed = Math.min(
              32,
              Math.max(1, frameAt - previousFrameAt),
            );
            previousFrameAt = frameAt;
            scrollBy(0, velocity * elapsed);
            velocity *= Math.pow(momentumDecayPerFrame, elapsed / (1000 / 60));
            if (Math.abs(velocity) < minimumVelocity) {
              momentumFrame = undefined;
              return;
            }
            momentumFrame = scheduler.request(continueMomentum);
          };
          momentumFrame = scheduler.request(continueMomentum);
        },
        cancel: stopMomentum,
      };
    },
  };
}
