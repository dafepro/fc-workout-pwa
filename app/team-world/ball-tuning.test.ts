import { describe, expect, it } from "vitest";
import type { WorldMap } from "zmap";
import source from "./world.json";
import { applyBallTuning, readBallTuning } from "./ball-tuning";

describe("pitch ball tuning", () => {
  it("authors a chaseable sky ball without changing other toys", () => {
    const map = structuredClone(source) as unknown as WorldMap;
    const pitch = map.toys.find((toy) => toy.id === "practice-ball")!;
    const other = map.toys.find((toy) => toy.id === "ball")!;
    const before = structuredClone(other);
    expect(readBallTuning(map)).toEqual({
      gravity: 5.4,
      speed: 6.1,
      friction: 1,
    });
    expect(pitch.strike).toMatchObject({ closeSpeed: 2.8, closeLift: 8.4 });
    applyBallTuning(map, { gravity: 4.2, speed: 7, friction: 0.5 });
    expect(
      map.toys.filter(
        (toy) => toy.id.includes("soccer-ball") || toy.id === "practice-ball",
      ),
    ).toHaveLength(2);
    for (const toy of map.toys.filter(
      (toy) => toy.id === "practice-ball" || toy.id === "garden-soccer-ball",
    )) {
      expect(toy.gravity).toBe(4.2);
      expect(toy.strike?.speed).toBe(7);
      expect(toy.strike?.closeSpeed).toBeCloseTo((7 * 2.8) / 6.1);
      expect(toy.rollingResistance).toBe(0.5);
    }
    expect(other).toEqual(before);
  });
});
