import { describe, expect, it } from "vitest";
import {
  gestureTransform,
  isPointInTrashDropZone,
  starCrownLayout,
  topAnchoredResize,
} from "./board-geometry";

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

describe("starCrownLayout", () => {
  it("keeps small crowns compact and centered instead of filling the arc", () => {
    const twoStars = starCrownLayout(2);

    expect(twoStars).toHaveLength(2);
    expect(twoStars[1].left - twoStars[0].left).toBeLessThanOrEqual(18);
    expect((twoStars[0].left + twoStars[1].left) / 2).toBeCloseTo(50);
    expect(twoStars[0].top).toBeCloseTo(twoStars[1].top);
  });

  it("uses one fixed even step for every crown size", () => {
    const fiveStars = starCrownLayout(5);
    const gaps = fiveStars
      .slice(1)
      .map((star, index) =>
        Number((star.angle - fiveStars[index].angle).toFixed(4)),
      );

    expect(new Set(gaps)).toEqual(new Set([18]));
    expect(fiveStars[2].left).toBeCloseTo(50);
  });
});

describe("isPointInTrashDropZone", () => {
  const board = { left: 0, top: 0, width: 320, height: 500 };

  it("recognizes the bottom-center delete target", () => {
    expect(isPointInTrashDropZone({ x: 160, y: 448 }, board)).toBe(true);
    expect(isPointInTrashDropZone({ x: 20, y: 20 }, board)).toBe(false);
  });
});

describe("topAnchoredResize", () => {
  it("moves the center down by half the growth so the top controls stay fixed", () => {
    const resized = topAnchoredResize(
      { x: 50, y: 42, size: 44, rotation: 0 },
      50,
      500,
    );

    expect(resized).toMatchObject({ size: 50, y: 42.6 });
    expect(resized.y * 5 - resized.size / 2).toBeCloseTo(188);
  });

  it("uses the bounded size change at the minimum and maximum", () => {
    expect(
      topAnchoredResize({ x: 50, y: 42, size: 74, rotation: 0 }, 90, 500),
    ).toMatchObject({ size: 76, y: 42.2 });
  });

  it("stops growing when moving the center would break the board bounds", () => {
    expect(
      topAnchoredResize({ x: 50, y: 94, size: 44, rotation: 0 }, 76, 500),
    ).toMatchObject({ size: 44, y: 94 });
  });
});
