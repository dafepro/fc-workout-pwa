import * as THREE from "three";

/** Visible character pixels mask a later, depth-tested silhouette pass. */
export function createCharacterOcclusion(parent: THREE.Object3D) {
  const layer = new THREE.Group();
  layer.name = "Character occlusion layer";
  layer.userData.comicSkip = true;
  parent.add(layer);
  const inverse = new THREE.Matrix4();
  const entries = new Map<
    THREE.Mesh,
    { overlays: THREE.Mesh[]; restore: (() => void)[] }
  >();
  const release = (source: THREE.Mesh) => {
    const entry = entries.get(source)!;
    for (const overlay of entry.overlays) {
      overlay.removeFromParent();
      (overlay.material as THREE.Material).dispose();
    }
    entry.restore.forEach((restore) => restore());
    entries.delete(source);
  };
  return {
    update(root: THREE.Object3D) {
      const sources = new Set<THREE.Mesh>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.userData.comicOutline)
          return;
        for (let p: THREE.Object3D | null = object; p; p = p.parent)
          if (p.userData.comicSkip) return;
        sources.add(object);
      });
      for (const source of entries.keys())
        if (!sources.has(source)) release(source);
      for (const source of sources) {
        if (entries.has(source)) continue;
        const restore: (() => void)[] = [];
        for (const material of Array.isArray(source.material)
          ? source.material
          : [source.material]) {
          const saved = {
            stencilWrite: material.stencilWrite,
            stencilRef: material.stencilRef,
            stencilFunc: material.stencilFunc,
            stencilZPass: material.stencilZPass,
          };
          Object.assign(material, {
            stencilWrite: true,
            stencilRef: 1,
            stencilFunc: THREE.AlwaysStencilFunc,
            stencilZPass: THREE.ReplaceStencilOp,
          });
          restore.push(() => Object.assign(material, saved));
        }
        const overlays = [true, false].map((rim) => {
          const material = new THREE.MeshBasicMaterial({
            color: rim ? "#f4ebd5" : "#6f7f87",
            opacity: rim ? 0.75 : 0.42,
            transparent: true,
            depthFunc: THREE.GreaterDepth,
            depthWrite: false,
            stencilWrite: true,
            stencilRef: 1,
            stencilFunc: THREE.NotEqualStencilFunc,
            stencilWriteMask: 0,
            toneMapped: false,
            side: rim ? THREE.BackSide : THREE.FrontSide,
          });
          if (rim) {
            material.onBeforeCompile = (shader) => {
              shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\ntransformed += normal * 0.018;",
              );
            };
            material.customProgramCacheKey = () => "campus-occlusion-rim-v1";
          }
          let overlay: THREE.Mesh;
          if (source instanceof THREE.SkinnedMesh) {
            const skinned = new THREE.SkinnedMesh(source.geometry, material);
            skinned.bindMode = source.bindMode;
            skinned.bind(source.skeleton, source.bindMatrix);
            overlay = skinned;
          } else overlay = new THREE.Mesh(source.geometry, material);
          overlay.name = rim ? "Occluded character rim" : "Occluded character";
          overlay.userData.comicSkip = true;
          overlay.renderOrder = rim ? 1000 : 1001;
          overlay.frustumCulled = source.frustumCulled;
          overlay.morphTargetInfluences = source.morphTargetInfluences;
          overlay.morphTargetDictionary = source.morphTargetDictionary;
          overlay.matrixAutoUpdate = false;
          layer.add(overlay);
          return overlay;
        });
        entries.set(source, { overlays, restore });
      }
    },
    sync() {
      layer.updateWorldMatrix(true, false);
      inverse.copy(layer.matrixWorld).invert();
      for (const [source, entry] of entries) {
        let visible = true;
        for (let p: THREE.Object3D | null = source; p; p = p.parent)
          if (!p.visible) visible = false;
        for (const overlay of entry.overlays) {
          overlay.visible = visible;
          overlay.matrix.multiplyMatrices(inverse, source.matrixWorld);
          overlay.matrixWorldNeedsUpdate = true;
        }
      }
    },
    dispose() {
      for (const source of entries.keys()) release(source);
      layer.removeFromParent();
    },
  };
}
