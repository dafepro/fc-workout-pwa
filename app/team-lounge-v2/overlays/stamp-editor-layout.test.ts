import { describe, expect, it } from "vitest";
import { layoutStampEditor, type EditorRect } from "./stamp-editor-layout";

describe("layoutStampEditor", () => {
  it("places the primary controls around a centered object", () => {
    const point = { x: 160, y: 240 };
    const layout = layoutStampEditor(point, { width: 320, height: 480 }, 30);

    expect(center(layout.size).y).toBeLessThan(point.y);
    expect(center(layout.rotateLeft).x).toBeLessThan(point.x);
    expect(center(layout.rotateRight).x).toBeGreaterThan(point.x);
    expect(center(layout.more).y).toBeGreaterThan(point.y);
  });

  it.each([
    { x: 22, y: 22 },
    { x: 298, y: 22 },
    { x: 22, y: 458 },
    { x: 298, y: 458 },
  ])("keeps every action visible and off the object at $x,$y", (point) => {
    const surface = { width: 320, height: 480 };
    const object = {
      x: point.x - 30,
      y: point.y - 30,
      width: 60,
      height: 60,
    };
    const layout = layoutStampEditor(point, surface, 30);

    for (const rect of [
      layout.size,
      layout.rotateLeft,
      layout.rotateRight,
      layout.more,
      layout.menu,
    ]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(surface.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(surface.height);
      expect(overlaps(rect, object)).toBe(false);
    }
  });
});

function center(rect: EditorRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function overlaps(first: EditorRect, second: EditorRect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}
