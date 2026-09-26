import { describe, expect, it } from "vitest";
import type { WorldMap } from "zmap";
import source from "../world.json";
import { createBallShadow } from "./ball-shadow";

describe("noon ball shadows", () => {
  it("stays vertically below the displayed ball and softens with altitude", () => {
    const shadow = createBallShadow(source as unknown as WorldMap, 0.3);
    shadow.update({ x: -8, y: 0.3, z: 13 }, 1);
    const lowSize = shadow.mesh.scale.x;
    const lowOpacity = shadow.mesh.material.opacity;
    shadow.update({ x: -7, y: 6.5, z: 14 }, 1);
    expect(shadow.mesh.position.x).toBe(-7);
    expect(shadow.mesh.position.z).toBe(14);
    expect(shadow.mesh.position.y).toBeCloseTo(0.05);
    expect(shadow.mesh.scale.x).toBeGreaterThan(lowSize);
    expect(shadow.mesh.material.opacity).toBeLessThan(lowOpacity);
    expect(shadow.mesh.material.opacity).toBeGreaterThan(0.2);
    shadow.dispose();
  });
  it("uses the surface below the ball, including bridge and underpass, and hides on dissolve", () => {
    const map = {
      ...source,
      surfaces: [
        {
          id: "ground",
          x: -10,
          z: -10,
          width: 20,
          depth: 20,
          y: 0,
          thickness: 1,
        },
        {
          id: "bridge",
          x: -2,
          z: -2,
          width: 4,
          depth: 4,
          y: 3,
          thickness: 0.4,
        },
      ],
    } as unknown as WorldMap;
    const shadow = createBallShadow(map, 0.3);
    shadow.update({ x: 0, y: 5, z: 0 }, 1);
    expect(shadow.mesh.position.y).toBeCloseTo(3.05);
    shadow.update({ x: 0, y: 1, z: 0 }, 1);
    expect(shadow.mesh.position.y).toBeCloseTo(0.05);
    shadow.update({ x: 0, y: 1, z: 0 }, 0);
    expect(shadow.mesh.visible).toBe(false);
    shadow.dispose();
  });
});
