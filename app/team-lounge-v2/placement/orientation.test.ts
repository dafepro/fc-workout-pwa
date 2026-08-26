import { describe, expect, it } from "vitest";
import {
  LOUNGE_STAMP_ORIENTATION_POLICY,
  LOUNGE_STAMP_ROTATION_STEP,
  nextLoungeStampRotation,
  normalizeLoungeStampRotation,
} from "./orientation";

describe("lounge stamp orientation", () => {
  it("rotates indefinitely in either direction while storing one canonical turn", () => {
    expect(LOUNGE_STAMP_ROTATION_STEP).toBe(Math.PI / 12);
    let clockwise = 0;
    let counterclockwise = 0;
    for (let step = 0; step < 25; step += 1) {
      clockwise = nextLoungeStampRotation(clockwise, 1);
      counterclockwise = nextLoungeStampRotation(counterclockwise, -1);
    }
    expect(clockwise).toBeCloseTo(Math.PI / 12);
    expect(counterclockwise).toBeCloseTo(-Math.PI / 12);
    expect(normalizeLoungeStampRotation(Math.PI)).toBeCloseTo(-Math.PI);
    expect(normalizeLoungeStampRotation(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(LOUNGE_STAMP_ORIENTATION_POLICY.canMirror).toBe(false);
  });
});
