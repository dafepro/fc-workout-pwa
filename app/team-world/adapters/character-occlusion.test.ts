import { expect, it } from "vitest";
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import {
  createCharacterOcclusion,
  markSilhouetteOccluder,
} from "./character-occlusion";
it("registers only original avatar geometry without clones or source material mutation", () => {
  const root = new Group(),
    body = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const ink = new Mesh(body.geometry, new MeshBasicMaterial());
  ink.userData.comicOutline = true;
  body.add(ink);
  root.add(body);
  const before = body.material.toJSON(),
    count = root.children.length;
  const effect = createCharacterOcclusion();
  effect.update(root);
  effect.update(root);
  expect(root.children).toHaveLength(count);
  expect(body.children).toEqual([ink]);
  expect(body.layers.mask).toBe(1 | (1 << 7));
  expect(ink.layers.mask).toBe(1);
  expect(body.material.toJSON()).toEqual(before);
  effect.dispose();
  expect(body.layers.mask).toBe(1);
});
it("only explicitly registered scenery can hide the avatar silhouette", () => {
  const ground = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const toy = new Mesh(ground.geometry, ground.material);
  markSilhouetteOccluder(ground);
  expect(ground.layers.mask).toBe(1 | (1 << 8));
  expect(toy.layers.mask).toBe(1);
});
