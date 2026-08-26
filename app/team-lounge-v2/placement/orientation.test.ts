import { describe, expect, it } from "vitest";
import {
  LOUNGE_STAMP_ORIENTATION_POLICY,
  loungeStampRotation,
} from "./orientation";

describe("lounge stamp orientation", () => {
  it("keeps rotation restrained and leaves mirroring asset-gated", () => {
    expect(LOUNGE_STAMP_ORIENTATION_POLICY.rotations).toEqual([
      -Math.PI / 12,
      0,
      Math.PI / 12,
    ]);
    expect(LOUNGE_STAMP_ORIENTATION_POLICY.canMirror).toBe(false);
    expect(loungeStampRotation(0.2)).toBe(Math.PI / 12);
    expect(loungeStampRotation(-0.05)).toBe(0);
  });
});
