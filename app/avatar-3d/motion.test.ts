import { describe, expect, it } from "vitest";

import { resolveAvatarMotion } from "./motion";

describe("resolveAvatarMotion", () => {
  it.each([
    [0, "idle"],
    [0.05, "idle"],
    [0.06, "walk"],
    [1.99, "walk"],
    [2, "run"],
  ] as const)("maps speed %s to %s", (speed, expected) => {
    expect(
      resolveAvatarMotion({
        speed,
        facingRadians: 0,
        grounded: true,
      }),
    ).toEqual({ kind: expected });
  });

  it("lets a one-shot emote override locomotion without networked keyframes", () => {
    expect(
      resolveAvatarMotion({
        speed: 3,
        facingRadians: Math.PI,
        grounded: true,
        emote: {
          clipId: "anim.celebration.fistpump",
          startedAt: 1_788_493_200_123,
        },
      }),
    ).toEqual({
      kind: "emote",
      clipId: "anim.celebration.fistpump",
      startedAt: 1_788_493_200_123,
    });
  });
});
