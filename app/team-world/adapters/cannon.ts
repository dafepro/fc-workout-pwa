import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ComicStyle } from "@zmap/avatar-studio";
import {
  CANNON_LOADING_TICKS,
  type CannonConfig,
  type CannonState,
  type ObjectEvent,
  type Vec3,
  type VisualOptions,
  type WorldMap,
  type WorldObject,
} from "zmap";

type Frame = Parameters<NonNullable<VisualOptions["frame"]>>[0];
type FireData = { toy: string; position: Vec3; velocity: Vec3 };
const requiredNodes = [
  "barrel_recoil",
  "fuse_tip",
  "gauge_needle",
  "indicator_0",
  "indicator_1",
  "indicator_2",
  "muzzle",
  "intake",
] as const;

function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

/** Assets are completely loaded and mechanically checked before the room opens. */
export async function loadCannonKit(map: WorldMap) {
  const definitions = (map.objects ?? []).filter(
    (object) => object.behavior === "cannon",
  );
  if (!definitions.length)
    throw Error("The action yard has no approved cannon");
  const url = new URL(
    "/team-world-assets/v0.1.3/ball-cannon.glb",
    location.href,
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw Error(`Ball cannon model unavailable (${response.status})`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024)
    throw Error("Ball cannon model exceeds the 2 MiB asset budget");
  const source = (await new GLTFLoader().parseAsync(bytes, url.href)).scene;
  try {
    for (const name of requiredNodes)
      if (!source.getObjectByName(name))
        throw Error(`Ball cannon is missing its ${name} mechanism`);
    source.updateMatrixWorld(true);
    for (const object of definitions) {
      const config = object.config as unknown as CannonConfig;
      for (const name of ["muzzle", "intake"] as const) {
        const position = source
          .getObjectByName(name)!
          .getWorldPosition(new THREE.Vector3());
        const expected = config[name];
        if (
          position.distanceTo(
            new THREE.Vector3(expected.x, expected.y, expected.z),
          ) > 0.06
        )
          throw Error(`Ball cannon ${name} does not match its physical socket`);
      }
    }
  } catch (error) {
    release(source);
    throw error;
  }
  let closed = false;
  const instances = definitions.map((definition) =>
    createCannon(source, definition, map),
  );
  return {
    scenery(scene: THREE.Scene) {
      if (closed) throw Error("Cannon kit is disposed");
      for (const instance of instances) scene.add(instance.root);
    },
    frame(context: Frame) {
      if (!closed) instances.forEach((instance) => instance.update(context));
    },
    diagnostics: () => ({
      ready: !closed,
      assetBytes: bytes.byteLength,
      instances: instances.map((instance) => instance.diagnostics()),
    }),
    dispose() {
      if (closed) return;
      closed = true;
      instances.forEach((instance) => instance.dispose());
      release(source);
    },
  };
}

function createCannon(
  source: THREE.Group,
  definition: WorldObject,
  map: WorldMap,
) {
  const config = definition.config as unknown as CannonConfig;
  const root = new THREE.Group();
  root.name = `world-object-${definition.id}`;
  root.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  root.rotation.y = definition.rotation;
  const model = source.clone(true);
  model.name = "ball-cannon-model";
  // Each prop can change its pressure lights independently; geometry remains shared.
  model.traverse((object) => {
    if (object instanceof THREE.Mesh)
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
  });
  root.add(model);
  const style = new ComicStyle({
    inkWidth: 1.6,
    shadowStrength: 0.72,
    pigment: 0.2,
  });
  const barrel = model.getObjectByName("barrel_recoil")!;
  const gauge = model.getObjectByName("gauge_needle")!;
  const fuseTip = model.getObjectByName("fuse_tip")!;
  const restBarrel = barrel.position.z,
    restGauge = gauge.rotation.z;
  const lights = [0, 1, 2].map((index) => {
    const lamp = model.getObjectByName(`indicator_${index}`)!;
    lamp.userData.comicSkip = true;
    const materials: THREE.MeshBasicMaterial[] = [];
    lamp.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const old = Array.isArray(object.material)
        ? object.material
        : [object.material];
      old.forEach((material) => material.dispose());
      const material = new THREE.MeshBasicMaterial({
        color: "#41645e",
        toneMapped: false,
      });
      object.material = material;
      materials.push(material);
    });
    return materials;
  });
  const effects = new THREE.Group();
  effects.name = "cannon-effects";
  root.add(effects);
  const particle = (name: string, count: number, color: string) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
      count,
    );
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    effects.add(mesh);
    return mesh;
  };
  const sparks = particle("cannon-fuse-sparks", 10, "#ffdf75");
  const flow = particle("cannon-intake-flow", 8, "#b8f3d6");
  const smoke = particle("cannon-muzzle-puff", 16, "#f3d9a2");
  const trail = particle("cannon-ball-trail", 14, "#eac473");
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.83, 1, 24),
    new THREE.MeshBasicMaterial({
      color: "#fff1b0",
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ring.name = "cannon-pressure-ring";
  ring.visible = false;
  effects.add(ring);
  const intakeMark = new THREE.Mesh(
    new THREE.RingGeometry(0.49, 0.55, 32),
    new THREE.MeshBasicMaterial({
      color: "#38897f",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  intakeMark.name = "cannon-feed-target";
  intakeMark.rotation.x = -Math.PI / 2;
  intakeMark.position.set(0, 0.021, -1.48);
  effects.add(intakeMark);
  // Three painted chevrons point from the ball's parking spot into the rear port.
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, -0.11);
  shape.lineTo(0, 0.11);
  shape.lineTo(0.22, -0.11);
  shape.lineTo(0.22, -0.02);
  shape.lineTo(0, 0.2);
  shape.lineTo(-0.22, -0.02);
  shape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(shape),
    arrowMaterial = new THREE.MeshBasicMaterial({
      color: "#609389",
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  for (let i = 0; i < 3; i++) {
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.022, -2.35 + i * 0.31);
    effects.add(arrow);
  }
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    point = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    tip = new THREE.Vector3();
  let fire: ObjectEvent | undefined,
    lastTick = -1,
    tickTime = 0,
    lastFrameTime = 0,
    phase = "ready",
    progress = 0,
    displayedTick = 0,
    observedFire = 0;
  const history: { tick: number; point: THREE.Vector3 }[] = [];
  function write(
    mesh: THREE.InstancedMesh,
    index: number,
    position: THREE.Vector3,
    radius: number,
  ) {
    scale.setScalar(radius);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  const update = ({ state, time, reducedMotion, viewport }: Frame) => {
    if (state.tick !== lastTick || time < lastFrameTime) {
      lastTick = state.tick;
      tickTime = time;
    }
    lastFrameTime = time;
    // Interpolate at most one fixed step. A paused authority never produces a new fire.
    displayedTick =
      state.tick + Math.min(0.95, Math.max(0, (time - tickTime) * 30));
    const shared = state.objects?.instances[definition.id] as unknown as
      | CannonState
      | undefined;
    const fuse = Object.values(shared?.balls ?? {}).find(
      (ball) => ball.phase === "fuse",
    );
    progress = fuse
      ? THREE.MathUtils.clamp(
          (displayedTick - fuse.startedTick) /
            (fuse.untilTick - fuse.startedTick),
          0,
          1,
        )
      : 0;
    fire = undefined;
    for (const event of state.objects?.events ?? [])
      if (event.object === definition.id && event.kind === "fire") fire = event;
    const age = fire ? (displayedTick - fire.tick) / 30 : Infinity;
    phase = fuse ? "fusing" : age < 0.75 ? "fired" : "ready";
    const recoil =
      age >= 0 && age < 0.48
        ? -0.22 * Math.exp(-age * 5.5) * Math.cos(age * 6.5)
        : 0;
    barrel.position.z =
      restBarrel + (reducedMotion ? 0 : recoil + progress * 0.012);
    gauge.rotation.z =
      restGauge + (fuse ? 1.9 * progress : Math.max(0, 1 - age / 0.45) * 1.9);
    lights.forEach((materials, index) =>
      materials.forEach((material) =>
        material.color.set(
          (fuse && progress >= index / 3) || age < 0.18 ? "#ffe98a" : "#41645e",
        ),
      ),
    );
    intakeMark.material.color.set(fuse ? "#e2ad3e" : "#38897f");
    sparks.count = flow.count = smoke.count = trail.count = 0;
    ring.visible = false;
    root.updateWorldMatrix(true, true);
    if (fuse && !reducedMotion) {
      fuseTip.getWorldPosition(tip);
      root.worldToLocal(tip);
      for (let i = 0; i < 10; i++) {
        const t = ((displayedTick - fuse.startedTick) / 10 + i / 10) % 1,
          angle = i * 2.399963;
        point
          .copy(tip)
          .add(
            new THREE.Vector3(
              Math.cos(angle) * t * 0.19,
              0.08 + t * 0.24 - t * t * 0.19,
              Math.sin(angle) * t * 0.19,
            ),
          );
        write(sparks, i, point, 0.023 * (1 - t) + 0.008);
      }
      sparks.count = 10;
      sparks.instanceMatrix.needsUpdate = true;
      if (
        displayedTick - fuse.startedTick <
        Math.min(CANNON_LOADING_TICKS, config.fuseTicks - 1)
      ) {
        for (let i = 0; i < 8; i++) {
          const t = ((displayedTick - fuse.startedTick) / 8 + i / 8) % 1;
          const angle = i * 2.399963 + t * 3.1;
          const radius = (1 - t) * 0.34 + 0.04;
          point.set(
            config.intake.x + Math.cos(angle) * radius,
            config.intake.y + Math.sin(angle) * radius,
            config.intake.z - 0.93 + t * 1.3,
          );
          write(flow, i, point, 0.022 + Math.sin(t * Math.PI) * 0.013);
        }
        flow.count = 8;
        flow.instanceMatrix.needsUpdate = true;
      }
    }
    if (fire && age >= 0 && age < 0.7) {
      const data = fire.data as unknown as FireData;
      point.set(data.position.x, data.position.y, data.position.z);
      root.worldToLocal(point);
      ring.position
        .copy(point)
        .add(new THREE.Vector3(0, 0, 0.08 + (reducedMotion ? 0 : age * 1.6)));
      ring.scale.setScalar(reducedMotion ? 0.67 : 0.45 + age * 1.65);
      ring.material.opacity = (reducedMotion ? 0.38 : 0.85) * (1 - age / 0.7);
      ring.visible = true;
      if (!reducedMotion) {
        const muzzle = point.clone();
        for (let i = 0; i < 16; i++) {
          const angle = i * 2.399963,
            radius = age * (0.9 + (i % 4) * 0.28);
          point.set(
            muzzle.x + Math.cos(angle) * radius,
            muzzle.y + Math.sin(angle) * radius + age * age * 0.5,
            muzzle.z + 0.12 + age * (1.2 + (i % 3) * 0.65),
          );
          write(
            smoke,
            i,
            point,
            (0.055 + age * (0.55 + (i % 3) * 0.12)) * (1 - age / 1.1),
          );
        }
        smoke.count = 16;
        smoke.material.opacity = 0.76 * (1 - age / 0.7);
        smoke.instanceMatrix.needsUpdate = true;
      }
      if (observedFire !== fire.id) {
        observedFire = fire.id;
        history.length = 0;
      }
      const body = state.toys[data.toy],
        toy = mapToyRadius(data.toy);
      if (body && history.at(-1)?.tick !== state.tick) {
        history.push({
          tick: state.tick,
          point: new THREE.Vector3(body.x, body.y + toy, body.z),
        });
        if (history.length > 14) history.shift();
      }
      if (!reducedMotion) {
        history.forEach((sample, index) => {
          point.copy(sample.point);
          root.worldToLocal(point);
          write(trail, index, point, 0.015 + (index / 14) * 0.06);
        });
        trail.count = history.length;
        trail.material.opacity = 0.5 * (1 - age / 0.7);
        trail.instanceMatrix.needsUpdate = true;
      }
    } else history.length = 0;
    style.update(model, viewport);
  };
  // This cannon accepts an app's ball ids; source geometry does not encode their radii.
  const radii = new Map<string, number>();
  for (const toy of map.toys) radii.set(toy.id, toy.radius);
  const mapToyRadius = (id: string) => radii.get(id) ?? 0;
  return {
    root,
    update,
    diagnostics: () => ({
      id: definition.id,
      phase,
      progress,
      displayedTick,
      lastFire: fire?.id ?? null,
      fireAge: fire ? (displayedTick - fire.tick) / 30 : null,
      recoil: barrel.position.z - restBarrel,
      sparks: sparks.count,
      flow: flow.count,
      smoke: smoke.count,
      trail: trail.count,
    }),
    dispose() {
      style.clear();
      model.traverse((object) => {
        if (object instanceof THREE.Mesh)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
      });
      release(effects);
      for (const mesh of [sparks, flow, smoke, trail]) mesh.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
