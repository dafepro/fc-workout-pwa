import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { createCampusCutaway } from "./campus-cutaway";

describe("campus sightline cutaway", () => {
  const hidden = (
    cutaway: ReturnType<typeof createCampusCutaway>,
    p: Vector3,
  ) => cutaway.planes.every((plane) => plane.distanceToPoint(p) < 0);

  it("reveals a player through both bridge decks and higher canopies", () => {
    const cutaway = createCampusCutaway();
    cutaway.update({ x: 4, y: 0, z: -17 });
    for (const y of [2.4, 6])
      expect(
        hidden(cutaway, new Vector3(4 + (16 * y) / 19, y, -17 + (16 * y) / 19)),
      ).toBe(true);
    expect(hidden(cutaway, new Vector3(4, 0, -17))).toBe(false);
    expect(hidden(cutaway, new Vector3(14, 2.4, -17))).toBe(false);
  });

  it("keeps the floor intact when standing on the raised terrace", () => {
    const cutaway = createCampusCutaway();
    cutaway.update({ x: -15, y: 2.4, z: -17 });
    expect(hidden(cutaway, new Vector3(-15, 2.416, -17))).toBe(false);
    expect(
      hidden(
        cutaway,
        new Vector3(-15 + (16 * 3.6) / 19, 6, -17 + (16 * 3.6) / 19),
      ),
    ).toBe(true);
  });

  it("clears the head sightline as well as the feet", () => {
    const cutaway = createCampusCutaway();
    cutaway.update({ x: 4, y: 0, z: -17 });
    for (const head of [0, 1.8, 2.2]) {
      const offset = (16 * (2.4 - head)) / 19;
      expect(hidden(cutaway, new Vector3(4 + offset, 2.4, -17 + offset))).toBe(
        true,
      );
    }
  });

  it("opens the engine slab too, without clipping toys or later characters", () => {
    const scene = new Scene();
    const slab = new Mesh(
      new BoxGeometry(16, 0.32, 4),
      new MeshStandardMaterial(),
    );
    const toy = new Mesh(new SphereGeometry(0.3), new MeshStandardMaterial());
    scene.add(slab, toy);
    const cutaway = createCampusCutaway();
    cutaway.bindTerrain(scene);
    const later = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    scene.add(later);
    expect(slab.material.clippingPlanes).toBe(cutaway.planes);
    expect(slab.material.clipIntersection).toBe(true);
    expect(toy.material.clippingPlanes).toBeNull();
    expect(later.material.clippingPlanes).toBeNull();
    cutaway.dispose();
    expect(slab.material.clippingPlanes).toBeNull();
    for (const m of [slab, toy, later]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  });

  it("turns off when there is no local player", () => {
    const cutaway = createCampusCutaway();
    cutaway.update({ x: 0, y: 0, z: 0 });
    cutaway.update(undefined);
    expect(hidden(cutaway, new Vector3(2, 2.4, 2))).toBe(false);
  });
});
