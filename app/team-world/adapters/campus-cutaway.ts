import { BoxGeometry, Material, Mesh, Plane, type Scene } from "three";
import type { Vec3 } from "zmap";

/** A narrow prism follows ZMap's (16,19,16) camera sightline above the player.
 * Intersection clipping opens overhead art without removing the walkable floor
 * or fading an entire merged district. It affects presentation only.
 */
export function createCampusCutaway() {
  const slope = 16 / 19;
  const normalScale = 1 / Math.hypot(1, slope);
  const radius = 1.35;
  const terrainMaterials = new Set<Material>();
  const planes = [
    new Plane().setComponents(1, -slope, 0, 0).normalize(),
    new Plane().setComponents(-1, slope, 0, 0).normalize(),
    new Plane().setComponents(0, -slope, 1, 0).normalize(),
    new Plane().setComponents(0, slope, -1, 0).normalize(),
    new Plane().setComponents(0, -1, 0, 10000),
  ];
  return {
    planes,
    bindTerrain(scene: Scene) {
      // In pinned ZMap 0.1.4, terrain is direct BoxGeometry children created
      // before scenery(). Capture now, before app props/avatars are attached,
      // so the engine's slab below our textured cap gets the same opening.
      for (const object of scene.children) {
        if (
          !(object instanceof Mesh) ||
          !(object.geometry instanceof BoxGeometry)
        )
          continue;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          terrainMaterials.add(material);
          material.clippingPlanes = planes;
          material.clipIntersection = true;
          material.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const material of terrainMaterials) {
        material.clippingPlanes = null;
        material.clipIntersection = false;
        material.needsUpdate = true;
      }
      terrainMaterials.clear();
    },
    update(player?: Vec3) {
      if (!player) {
        planes[4].constant = 10000;
        return;
      }
      // Centre on the torso so the aperture contains both head and feet rays.
      const x = player.x - slope * (player.y + 0.85);
      const z = player.z - slope * (player.y + 0.85);
      planes[0].constant = (-x - radius) * normalScale;
      planes[1].constant = (x - radius) * normalScale;
      planes[2].constant = (-z - radius) * normalScale;
      planes[3].constant = (z - radius) * normalScale;
      planes[4].constant = player.y + 1.6;
    },
  };
}
