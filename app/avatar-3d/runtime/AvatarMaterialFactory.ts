import { Color, Material, Mesh, type Object3D } from "three";

export class AvatarMaterialFactory {
  applyTint(root: Object3D, value: string): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh) || object.userData.tintable !== true)
        return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => tintMaterial(material, value))
        : tintMaterial(object.material, value);
    });
  }
}

function tintMaterial(material: Material, value: string): Material {
  const tinted = material.clone() as Material & { color?: Color };
  tinted.color?.set(value);
  return tinted;
}
