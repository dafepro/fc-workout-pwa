import { describe, it, expect } from "vitest";
import { renderPixelRatio } from "./render-budget";

describe("Team World raster budget", () => {
  it("keeps phone and ordinary desktop detail without supersampling low-DPI displays", () => {
    expect(renderPixelRatio(390, 844, 3)).toBe(1.5);
    expect(renderPixelRatio(1280, 720, 1)).toBe(1);
  });
  it("bounds fullscreen high-DPI and ultrawide drawing buffers", () => {
    for (const [w, h, dpr] of [
      [1440, 900, 2],
      [3840, 2160, 2],
      [5120, 1440, 1],
    ]) {
      const ratio = renderPixelRatio(w, h, dpr);
      expect(w * h * ratio * ratio).toBeLessThanOrEqual(1_500_001);
      expect(ratio).toBeGreaterThan(0);
    }
  });
});
