import { describe, expect, it } from "vitest";
import { loungeWorldPoint } from "./coordinates";

describe("free lounge placement coordinates", () => {
  it("maps CSS room coordinates through the Canvas viewport", () => {
    expect(
      loungeWorldPoint(
        { x: 420, y: 630 },
        { width: 500, height: 750, scale: 5, offsetX: 20, offsetY: 30 },
        { width: 100, height: 150 },
      ),
    ).toEqual({ x: 80, y: 120 });
  });

  it("rejects the room edge outside the decorating margin", () => {
    expect(
      loungeWorldPoint(
        { x: 12, y: 300 },
        { width: 500, height: 750, scale: 5, offsetX: 0, offsetY: 0 },
        { width: 100, height: 150 },
      ),
    ).toBeNull();
    expect(
      loungeWorldPoint(
        { x: 475, y: 725 },
        { width: 500, height: 750, scale: 5, offsetX: 0, offsetY: 0 },
        { width: 100, height: 150 },
      ),
    ).toEqual({ x: 95, y: 145 });
  });
});
