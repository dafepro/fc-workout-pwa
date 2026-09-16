import { describe, expect, it } from "vitest";
import { canWalkSegment, type WorldMap } from "zmap";
import mapJSON from "../world.json";
import { campusPath } from "./campus-navigation";

const map = mapJSON as unknown as WorldMap;
describe("campus navigation", () => {
  it.each([
    ["across the pitch", { x: -20, y: 0, z: 12 }, { x: 5, y: 0, z: 12 }],
    ["up the social ramp", { x: -6, y: 0, z: 3 }, { x: -6, y: 2.4, z: -12 }],
    ["across the bridge", { x: -3, y: 2.4, z: -17 }, { x: 13, y: 2.4, z: -17 }],
    ["under the bridge", { x: 4, y: 0, z: -21 }, { x: 4, y: 0, z: -13 }],
    ["around pitch seating", { x: -8, y: 0, z: 25 }, { x: -8, y: 0, z: 30 }],
  ])("routes %s on physical terrain", (_, start, end) => {
    const route = campusPath(map, start, end);
    expect(route.status).toBe("ready");
    if (route.status !== "ready") return;
    for (let i = 1; i < route.points.length; i++)
      expect(canWalkSegment(map, route.points[i - 1], route.points[i])).toBe(
        true,
      );
  });
  it("rejects a destination outside the connected terrain", () => {
    expect(campusPath(map, map.spawn, { x: 65, y: 0, z: 65 }).status).toBe(
      "unreachable",
    );
  });
});
