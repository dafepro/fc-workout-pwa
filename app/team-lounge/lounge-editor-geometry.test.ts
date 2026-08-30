import { describe, expect, it } from "vitest";

import {
  clampLoungeItemScale,
  loungeWorldPoint,
  nextLoungeItemRotation,
} from "./lounge-editor-geometry";

describe("Lounge item editor geometry", () => {
  it("converts a screen drag into an exact bounded Canvas point", () => {
    expect(
      loungeWorldPoint(
        { x: 168, y: 260 },
        { width: 320, height: 480, scale: 3, offsetX: 18, offsetY: 20 },
        { width: 100, height: 150 },
      ),
    ).toEqual({ x: 50, y: 80 });
    expect(
      loungeWorldPoint(
        { x: 2, y: 2 },
        { width: 320, height: 480, scale: 3, offsetX: 0, offsetY: 0 },
        { width: 100, height: 150 },
      ),
    ).toBeNull();
  });

  it("keeps size within the Canvas policy bounds", () => {
    expect(clampLoungeItemScale(0.7)).toBe(0.75);
    expect(clampLoungeItemScale(1.13)).toBe(1.1);
    expect(clampLoungeItemScale(1.5)).toBe(1.4);
  });

  it("rotates in normalized 15 degree steps", () => {
    expect(nextLoungeItemRotation(0, 1)).toBeCloseTo(Math.PI / 12);
    expect(nextLoungeItemRotation(-Math.PI, -1)).toBeCloseTo(
      (11 * Math.PI) / 12,
    );
  });
});
