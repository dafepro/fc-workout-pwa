import { Color, Material, Mesh, type Object3D } from "three";

export class AvatarMaterialFactory {
  applyTint(root: Object3D, value: string): void {
    applyTaggedTint(root, "tintable", value);
  }

  applySkinTone(root: Object3D, value: string): void {
    applyTaggedTint(root, "skinTintable", value);
  }
}

function applyTaggedTint(
  root: Object3D,
  tag: "tintable" | "skinTintable",
  value: string,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData[tag] !== true) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => tintMaterial(material, value))
      : tintMaterial(object.material, value);
  });
}

function tintMaterial(material: Material, value: string): Material {
  const tinted = material.clone() as Material & { color?: Color };
  tinted.color?.set(value);
  return tinted;
}
