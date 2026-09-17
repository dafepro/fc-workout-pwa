import { expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  GreaterDepth,
  NotEqualStencilFunc,
} from "three";
import { createCharacterOcclusion } from "./character-occlusion";

it("adds depth-only ghost treatment to body meshes, not effects or comic ink, and releases it", () => {
  const root = new Group();
  const source = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const ink = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  ink.userData.comicOutline = true;
  source.add(ink);
  root.add(source);
  const effect = createCharacterOcclusion(root);
  effect.update(root);
  expect(source.children).toEqual([ink]);
  const layer = root.getObjectByName("Character occlusion layer")!;
  expect(layer.children).toHaveLength(2);
  expect(ink.children).toHaveLength(0);
  const ghost = layer.children.find(
    (o) => o.name === "Occluded character",
  ) as Mesh;
  const material = ghost.material as MeshBasicMaterial;
  expect(material.depthFunc).toBe(GreaterDepth);
  expect(material.stencilFunc).toBe(NotEqualStencilFunc);
  expect(material.depthWrite).toBe(false);
  expect(source.material.stencilWrite).toBe(true);
  effect.update(root);
  expect(layer.children).toHaveLength(2);
  source.position.x = 3;
  root.updateMatrixWorld(true);
  effect.sync();
  expect(ghost.matrix.elements[12]).toBe(3);
  source.visible = false;
  effect.sync();
  expect(ghost.visible).toBe(false);
  effect.dispose();
  expect(source.children).toEqual([ink]);
  expect(source.material.stencilWrite).toBe(false);
});
