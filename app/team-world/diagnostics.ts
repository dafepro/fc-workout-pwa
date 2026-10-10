import { captureMotion } from "./motion-recorder";
import * as THREE from "three";
import type { Character, Zoomap } from "zmap";
import { createCharacterOcclusion } from "./adapters/character-occlusion";
import { renderPixelRatio } from "./render-budget";
export const normalRendering = {
  avatar: "model" as "model" | "capsule",
  silhouette: true,
  comic: true,
  outlines: true,
  animation: true,
  campus: true,
  freezeCamera: false,
  material: "original" as "original" | "normal" | "wireframe",
  resolution: "1" as "1" | "0.75" | "0.5",
};
export type RenderSettings = typeof normalRendering;
export const minimalRendering: RenderSettings = {
  ...normalRendering,
  avatar: "capsule",
  silhouette: false,
  comic: false,
  outlines: false,
  animation: false,
  material: "normal",
  resolution: "0.5",
};
export const renderSettingsKey = "zoomigo.world-render-diagnostics.v1";
export function readRenderSettings(): RenderSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(renderSettingsKey) ?? "null");
    const result = { ...normalRendering };
    for (const key of [
      "silhouette",
      "comic",
      "outlines",
      "animation",
      "campus",
      "freezeCamera",
    ] as const)
      if (typeof saved?.[key] === "boolean") result[key] = saved[key];
    if (["model", "capsule"].includes(saved?.avatar))
      result.avatar = saved.avatar;
    if (["original", "normal", "wireframe"].includes(saved?.material))
      result.material = saved.material;
    if (["1", "0.75", "0.5"].includes(saved?.resolution))
      result.resolution = saved.resolution;
    return result;
  } catch {
    return { ...normalRendering };
  }
}
export function createRenderDiagnostics(settings: () => RenderSettings) {
  const normal = new THREE.MeshNormalMaterial();
  const wireframe = new THREE.MeshBasicMaterial({
    color: "#354a50",
    wireframe: true,
  });
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  let frozen = false;
  return {
    character(character: Character): Character {
      const object = new THREE.Group(),
        capsule = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color: "#d79d39" });
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.28, 0.94, 4, 8),
        material,
      );
      body.position.y = 0.75;
      const nose = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: "#742c42" }),
      );
      nose.position.set(0, 1.2, 0.3);
      capsule.add(body, nose);
      object.add(character.object, capsule);
      const occlusion = createCharacterOcclusion();
      occlusion.update(capsule);
      return {
        object,
        update(body, time, context) {
          const s = settings(),
            simple = s.avatar === "capsule";
          character.object.visible = !simple;
          capsule.visible = simple;
          if (!simple)
            character.update(
              body,
              time,
              s.animation || !context
                ? context
                : { ...context, reducedMotion: true },
            );
        },
        dispose() {
          occlusion.dispose();
          character.dispose?.();
          for (const mesh of [body, nose]) {
            mesh.geometry.dispose();
            mesh.material.dispose();
          }
          object.clear();
        },
      };
    },
    frame(world: Zoomap) {
      const s = settings(),
        view = world.view;
      view.scene.overrideMaterial =
        s.material === "normal"
          ? normal
          : s.material === "wireframe"
            ? wireframe
            : null;
      const ratio =
        renderPixelRatio(
          view.canvas.clientWidth,
          view.canvas.clientHeight,
          devicePixelRatio,
        ) * Number(s.resolution);
      if (Math.abs(view.renderer.getPixelRatio() - ratio) > 0.001)
        view.renderer.setPixelRatio(ratio);
      if (s.freezeCamera) {
        if (!frozen) {
          position.copy(view.camera.position);
          rotation.copy(view.camera.quaternion);
        }
        view.camera.position.copy(position);
        view.camera.quaternion.copy(rotation);
      }
      frozen = s.freezeCamera;
    },
    dispose() {
      normal.dispose();
      wireframe.dispose();
    },
  };
}
export function renderReport(
  world: Zoomap | null,
  settings: RenderSettings,
  capture = false,
) {
  const view = world?.view,
    gl = view?.renderer.getContext(),
    extension = gl?.getExtension("WEBGL_debug_renderer_info");
  const local = world?.local;
  return {
    version: 2,
    motion: capture ? captureMotion(world) : undefined,
    capturedAt: new Date().toISOString(),
    route: location.pathname,
    settings: { ...settings },
    status: world?.status ?? "loading",
    tick: world?.state.tick,
    players: world?.roster.length,
    localHost: world ? world.host === world.session : null,
    position: local ? { x: local.x, y: local.y, z: local.z } : null,
    browser: navigator.userAgent,
    devicePixelRatio,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    graphics: {
      width: view?.canvas.width ?? 0,
      height: view?.canvas.height ?? 0,
      renderer: extension
        ? (gl!.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string)
        : "unavailable",
    },
    performance: view?.diagnostics(),
  };
}
