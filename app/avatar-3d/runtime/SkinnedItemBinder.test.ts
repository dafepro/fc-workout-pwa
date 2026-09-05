import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";

import { SkinnedItemBinder } from "./SkinnedItemBinder";

describe("SkinnedItemBinder", () => {
  it("rebinds an authored garment to the live canonical skeleton", () => {
    const avatar = rig(["hips", "chest"]);
    const garment = skinnedGarment(["hips", "chest"]);
    const mesh = garment.getObjectByName("garment") as SkinnedMesh;
    const sourceBones = [...mesh.skeleton.bones];

    expect(new SkinnedItemBinder().bind(avatar, garment)).toBe(true);
    expect(mesh.parent).toBe(avatar);
    expect(mesh.skeleton.bones.map(({ name }) => name)).toEqual([
      "hips",
      "chest",
    ]);
    expect(mesh.skeleton.bones[0]).toBe(avatar.getObjectByName("hips"));
    expect(mesh.skeleton.bones[1]).toBe(avatar.getObjectByName("chest"));
    expect(mesh.skeleton.bones).not.toEqual(sourceBones);
  });

  it("rejects a garment before mutating it when the live rig is incomplete", () => {
    const avatar = rig(["hips"]);
    const garment = skinnedGarment(["hips", "chest"]);
    const mesh = garment.getObjectByName("garment") as SkinnedMesh;
    const originalParent = mesh.parent;
    const originalSkeleton = mesh.skeleton;

    expect(new SkinnedItemBinder().bind(avatar, garment)).toBe(false);
    expect(mesh.parent).toBe(originalParent);
    expect(mesh.skeleton).toBe(originalSkeleton);
  });
});

function rig(names: readonly string[]): Group {
  const root = new Group();
  root.name = "ZoomigoAvatar";
  let parent: Object3D = root;
  for (const name of names) {
    const bone = new Bone();
    bone.name = name;
    parent.add(bone);
    parent = bone;
  }
  root.updateMatrixWorld(true);
  return root;
}

function skinnedGarment(names: readonly string[]): Group {
  const root = new Group();
  root.name = "AvatarCosmetic";
  const bones = names.map((name) => {
    const bone = new Bone();
    bone.name = name;
    return bone;
  });
  for (let index = 1; index < bones.length; index += 1) {
    bones[index - 1].add(bones[index]);
  }
  root.add(bones[0]);

  const geometry = new BoxGeometry();
  const vertexCount = geometry.attributes.position.count;
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    indices[index * 4] = Math.min(1, bones.length - 1);
    weights[index * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.name = "garment";
  root.add(mesh);
  mesh.bind(new Skeleton(bones));
  return root;
}
