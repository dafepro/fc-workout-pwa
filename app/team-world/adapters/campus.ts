import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** App-owned art, layered over the same world.json terrain used by the relay. */
export async function loadCampus(signal?: AbortSignal) {
  const response = await fetch("/team-world-assets/campus-v1/team-campus.glb", {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error("Campus scenery unavailable");
  const root = (
    await new GLTFLoader().parseAsync(await response.arrayBuffer(), "")
  ).scene;
  root.name = "team-campus";
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometry.add(object.geometry);
    for (const m of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(m);
      for (const value of Object.values(m))
        if (value instanceof THREE.Texture) {
          textures.add(value);
          value.anisotropy = 4;
        }
    }
  });
  let closed = false;
  return {
    scenery(scene: THREE.Scene) {
      scene.background = new THREE.Color("#dedfd2");
      scene.add(root);
    },
    dispose() {
      if (closed) return;
      closed = true;
      // Detach before WorldView traverses its own resources on disposal.
      root.removeFromParent();
      for (const g of geometry) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) {
        t.dispose();
        if (
          typeof ImageBitmap !== "undefined" &&
          t.image instanceof ImageBitmap
        )
          t.image.close();
      }
    },
  };
}
