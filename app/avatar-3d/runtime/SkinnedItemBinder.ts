import { Bone, Skeleton, SkinnedMesh, type Object3D } from "three";

interface PreparedBinding {
  mesh: SkinnedMesh;
  skeleton: Skeleton;
}

export class SkinnedItemBinder {
  bind(avatar: Object3D, cosmetic: Object3D): boolean {
    const liveBones = new Map<string, Bone>();
    avatar.traverse((object) => {
      if (object instanceof Bone) liveBones.set(object.name, object);
    });

    const meshes: SkinnedMesh[] = [];
    cosmetic.traverse((object) => {
      if (object instanceof SkinnedMesh) meshes.push(object);
    });
    if (meshes.length === 0) return false;

    const bindings: PreparedBinding[] = [];
    for (const mesh of meshes) {
      const bones = mesh.skeleton.bones.map((sourceBone) =>
        liveBones.get(sourceBone.name),
      );
      if (
        bones.some((bone) => !bone) ||
        mesh.skeleton.boneInverses.length !== bones.length
      ) {
        return false;
      }
      bindings.push({
        mesh,
        skeleton: new Skeleton(
          bones as Bone[],
          mesh.skeleton.boneInverses.map((inverse) => inverse.clone()),
        ),
      });
    }

    for (const { mesh, skeleton } of bindings) {
      mesh.removeFromParent();
      avatar.add(mesh);
      mesh.bind(skeleton, mesh.bindMatrix);
    }
    return true;
  }
}
