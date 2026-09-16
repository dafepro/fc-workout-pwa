import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  objectInteractionAvailable,
  type WorldMap,
  type Zoomap,
  type VisualOptions,
} from "zmap";
import { worldCopy } from "../copy";

type Frame = Parameters<NonNullable<VisualOptions["frame"]>>[0];
export type ItemAction = {
  object: string;
  action: string;
  label: string;
  disabled: boolean;
};

/** Each approved prop supplies its own presentation and labels over the shared interaction contract. */
export async function loadInteractiveProps(map: WorldMap) {
  const definition = map.objects!.find((o) => o.id === "courtyard-lamp")!;
  const response = await fetch(
    "/team-world-assets/kenney/lampSquareFloor.glb",
    { signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw Error("Courtyard lamp unavailable");
  const source = (
    await new GLTFLoader().parseAsync(
      await response.arrayBuffer(),
      location.href,
    )
  ).scene;
  const root = new THREE.Group();
  root.name = "courtyard-lamp";
  const bounds = new THREE.Box3().setFromObject(source),
    center = bounds.getCenter(new THREE.Vector3());
  source.position.set(-center.x, -bounds.min.y, -center.z);
  source.scale.setScalar(2.8);
  source.position.multiplyScalar(2.8);
  root.add(source);
  root.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  const shades: THREE.MeshStandardMaterial[] = [];
  source.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials)
        if (m.name === "lamp") shades.push(m as THREE.MeshStandardMaterial);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(o.geometry),
        new THREE.LineBasicMaterial({ color: "#25363a" }),
      );
      o.add(edge);
    }
  });
  const light = new THREE.PointLight("#ffd58c", 0, 5, 2);
  light.position.set(0, 2.05, 0);
  root.add(light);
  // A shallow pool stays depth-tested: it must not paint over feet or balls.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.65, 48),
    new THREE.MeshBasicMaterial({
      color: "#fbd67b",
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.018;
  pool.visible = false;
  root.add(pool);
  let current = false,
    closed = false;
  const ray = new THREE.Raycaster();
  return {
    scenery(scene: THREE.Scene) {
      scene.add(root);
    },
    frame({ state }: Frame) {
      const on =
        (state.objects?.instances[definition.id] as { on: boolean } | undefined)
          ?.on ?? false;
      if (on === current) return;
      current = on;
      light.intensity = on ? 8 : 0;
      pool.visible = on;
      for (const m of shades) {
        m.emissive.set(on ? "#ffd58c" : "#000000");
        m.emissiveIntensity = on ? 1.5 : 0;
      }
    },
    actions(world: Zoomap): ItemAction[] {
      if (world.status !== "ready") return [];
      return (map.actionCatalog?.interactions ?? [])
        .filter((e) => e.object === definition.id)
        .filter((e) =>
          objectInteractionAvailable(
            map,
            world.state,
            world.session,
            e.object,
            e.action,
            world.durable.items,
            world.options.catalog,
          ),
        )
        .map((e) => ({
          object: e.object,
          action: e.action,
          label: current ? worldCopy.lamp.off : worldCopy.lamp.on,
          disabled: (() => {
            const tick = (
              world.state.objects?.instances[e.object] as {
                changedTick: number;
              }
            ).changedTick;
            return tick > 0 && world.state.tick - tick < 9;
          })(),
        }));
    },
    interactAt(world: Zoomap, x: number, y: number) {
      const rect = world.view.canvas.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          1 - ((y - rect.top) / rect.height) * 2,
        ),
        world.view.camera,
      );
      if (!ray.intersectObject(source, true).length) return false;
      const action = this.actions(world).find(
        (a) => a.object === definition.id,
      );
      if (!action) return false;
      if (!action.disabled) world.interact(action.object, action.action);
      return true;
    },
    dispose() {
      if (closed) return;
      closed = true;
      root.removeFromParent();
      const materials = new Set<THREE.Material>(),
        geometries = new Set<THREE.BufferGeometry>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          for (const x of Array.isArray(m.material) ? m.material : [m.material])
            materials.add(x);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      root.clear();
    },
  };
}
