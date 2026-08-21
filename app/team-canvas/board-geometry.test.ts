import { describe, expect, it } from "vitest";
import { gestureTransform } from "./board-geometry";

describe("gestureTransform", () => {
  it("moves a selected piece with one pointer in board coordinates", () => {
    expect(
      gestureTransform(
        { x: 50, y: 40, size: 40, rotation: 0 },
        [{ id: 1, x: 100, y: 100 }],
        [{ id: 1, x: 140, y: 80 }],
        { width: 400, height: 200 },
      ),
    ).toMatchObject({ x: 60, y: 30, size: 40, rotation: 0 });
  });

  it("uses two pointers to move, resize, and rotate the piece", () => {
    const result = gestureTransform(
      { x: 50, y: 50, size: 40, rotation: 0 },
      [
        { id: 1, x: 100, y: 100 },
        { id: 2, x: 200, y: 100 },
      ],
      [
        { id: 1, x: 125, y: 50 },
        { id: 2, x: 125, y: 250 },
      ],
      { width: 500, height: 500 },
    );

    expect(result.x).toBe(45);
    expect(result.y).toBe(60);
    expect(result.size).toBe(80);
    expect(result.rotation).toBe(90);
  });
});
