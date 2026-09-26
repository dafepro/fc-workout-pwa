import * as THREE from "three";
import { supportAt, top } from "zmap/core";
import type { Vec3, WorldMap } from "zmap";

export function createBallShadow(map: WorldMap, radius: number) {
  const size = 64,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(
        ((x + 0.5) / size) * 2 - 1,
        ((y + 0.5) / size) * 2 - 1,
      );
      const alpha = 1 - THREE.MathUtils.smoothstep(distance, 0.36, 0.98);
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(alpha * 255);
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    color: "#14241a",
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = "Noon ball shadow";
  mesh.renderOrder = 1;
  mesh.visible = false;
  return {
    mesh,
    update(center: Vec3, visibility: number) {
      const surface = supportAt(
        map,
        center.x,
        center.z,
        center.y - radius + 0.05,
      );
      mesh.visible = !!surface && visibility > 0.001;
      if (!surface) return;
      const floor = top(surface, center.z),
        altitude = Math.max(0, center.y - radius - floor),
        extent = radius + 0.09 + Math.min(altitude, 12) * 0.028,
        slope = surface.slope ?? 0;
      // Clear the campus turf and chalk geometry (up to 3.6 cm above support).
      mesh.position.set(center.x, floor + 0.05, center.z);
      mesh.rotation.x = -Math.PI / 2 - Math.atan(slope);
      mesh.scale.set(extent, extent * Math.hypot(1, slope), 1);
      material.opacity = (0.68 / (1 + altitude * 0.08)) * visibility;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
