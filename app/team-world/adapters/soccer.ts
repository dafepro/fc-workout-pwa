import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { markSilhouetteOccluder } from "./character-occlusion";
import type { VisualOptions, WorldMap } from "zmap";
import {
  pitchConfig,
  pitchState,
  GOAL_HOLD_TICKS,
  GOAL_DISSOLVE_TICKS,
  BALL_RETURN_TICKS,
} from "../soccer.mjs";

/** Truncated icosahedron: twelve dark pentagons and twenty ivory hexagons. */
function footballGeometry(radius: number) {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const vertices: THREE.Vector3[] = [],
    faces: number[][] = [];
  const positions = ico.getAttribute("position");
  for (let i = 0; i < positions.count; i += 3) {
    const face: number[] = [];
    for (let j = 0; j < 3; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, i + j);
      let index = vertices.findIndex((p) => p.distanceToSquared(v) < 0.00001);
      if (index < 0) {
        index = vertices.length;
        vertices.push(v);
      }
      face.push(index);
    }
    faces.push(face);
  }
  ico.dispose();
  const edge = (a: number, b: number) =>
    vertices[a]
      .clone()
      .multiplyScalar(2)
      .add(vertices[b])
      .normalize()
      .multiplyScalar(radius);
  const geometry = new THREE.BufferGeometry(),
    buffer: number[] = [];
  const panel = (points: THREE.Vector3[], material: number) => {
    const center = points
      .reduce((v, p) => v.add(p), new THREE.Vector3())
      .divideScalar(points.length);
    if (
      points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]))
        .dot(center) < 0
    )
      points.reverse();
    const start = buffer.length / 3;
    for (let i = 0; i < points.length; i++)
      buffer.push(
        ...center.toArray(),
        ...points[i].toArray(),
        ...points[(i + 1) % points.length].toArray(),
      );
    const last = geometry.groups.at(-1);
    if (last?.materialIndex === material)
      last.count += buffer.length / 3 - start;
    else geometry.addGroup(start, buffer.length / 3 - start, material);
  };
  for (const [a, b, c] of faces)
    panel(
      [edge(a, b), edge(b, a), edge(b, c), edge(c, b), edge(c, a), edge(a, c)],
      0,
    );
  vertices.forEach((v, a) => {
    const neighbors = [
      ...new Set(faces.filter((f) => f.includes(a)).flat()),
    ].filter((b) => b !== a);
    const points = neighbors.map((b) => edge(a, b));
    const normal = v.clone().normalize(),
      u = points[0]
        .clone()
        .sub(v.clone().multiplyScalar(points[0].dot(v) / v.lengthSq()))
        .normalize(),
      w = new THREE.Vector3().crossVectors(normal, u);
    points.sort(
      (p, q) => Math.atan2(p.dot(w), p.dot(u)) - Math.atan2(q.dot(w), q.dot(u)),
    );
    panel(points, 1);
  });
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(buffer, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function createSoccerVisuals(map: WorldMap) {
  const pitches = (map.objects ?? []).filter((o) => o.behavior === "soccer");
  const balls = new Map<
    string,
    {
      mesh: THREE.Mesh;
      dissolve: { value: number };
      materials: THREE.MeshStandardMaterial[];
    }
  >();
  const boards = new Map<
    string,
    { root: THREE.Group; digits: THREE.InstancedMesh; last: string }
  >();
  const nets = new Map<
    string,
    { sign: number; root: THREE.Group; impact: { value: number } }[]
  >();
  const owned = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Texture
  >();
  let goalSource: THREE.Group, boardSource: THREE.Group;
  const segmentGeometry = new THREE.BoxGeometry(0.38, 0.075, 0.055);
  const digitMaterial = new THREE.MeshStandardMaterial({
    color: "#fff0c2",
    emissive: "#eed89b",
    emissiveIntensity: 0.3,
    roughness: 0.4,
  });
  owned.add(segmentGeometry);
  owned.add(digitMaterial);
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const digitMasks = [
    0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f,
  ];
  const segments = [
    [0, 0.42, 0],
    [0.2, 0.21, 1],
    [0.2, -0.21, 1],
    [0, -0.42, 0],
    [-0.2, -0.21, 1],
    [-0.2, 0.21, 1],
    [0, 0, 0],
  ];
  function updateDigits(mesh: THREE.InstancedMesh, scores: number[]) {
    let index = 0;
    scores.forEach((score, side) => {
      const chars = String(score).padStart(2, "0"),
        scale = Math.min(1, 2.6 / (chars.length * 0.56));
      for (let digit = 0; digit < 6; digit++)
        for (let segment = 0; segment < 7; segment++) {
          const [x, y, vertical] = segments[segment];
          const on =
            digit < chars.length &&
            digitMasks[Number(chars[digit])] & (1 << segment);
          rotation.setFromAxisAngle(axis, (vertical * Math.PI) / 2);
          matrix.compose(
            new THREE.Vector3(
              (side ? 1.58 : -1.58) +
                (x + (digit - (chars.length - 1) / 2) * 0.56) * scale,
              2.99 + y * scale,
              0.38,
            ),
            rotation,
            new THREE.Vector3().setScalar(on ? scale : 0),
          );
          mesh.setMatrixAt(index++, matrix);
        }
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    async load(signal?: AbortSignal) {
      const models = await Promise.allSettled(
        ["pitch-goal-v2.glb", "pitch-scoreboard-v2.glb"].map(async (name) => {
          const response = await fetch(`/team-world-assets/campus-v2/${name}`, {
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
              : AbortSignal.timeout(30000),
          });
          if (!response.ok) throw Error("Pitch item unavailable");
          const root = (
            await new GLTFLoader().parseAsync(await response.arrayBuffer(), "")
          ).scene;
          root.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              owned.add(o.geometry);
              for (const m of Array.isArray(o.material)
                ? o.material
                : [o.material])
                owned.add(m);
            }
          });
          return root;
        }),
      );
      const sources = models.map((result) => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      });
      [goalSource, boardSource] = sources;
    },
    toy(id: string) {
      if (!pitches.some((o) => pitchConfig(o).ball === id)) {
        const toy = map.toys.find((t) => t.id === id)!;
        return new THREE.Mesh(
          new THREE.IcosahedronGeometry(toy.radius, 1),
          new THREE.MeshStandardMaterial({
            color: toy.color,
            flatShading: true,
          }),
        );
      }
      const dissolve = { value: 0 };
      const materials = ["#f1eddf", "#233239"].map((color) => {
        const m = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          transparent: true,
        });
        m.onBeforeCompile = (shader) => {
          shader.uniforms.dissolve = dissolve;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vBallPosition;",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvBallPosition=position;",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float dissolve; varying vec3 vBallPosition;",
            )
            .replace(
              "#include <alphatest_fragment>",
              "#include <alphatest_fragment>\nfloat grain=fract(sin(dot(floor(vBallPosition*80.0),vec3(12.9898,78.233,45.164)))*43758.5453); if(grain<dissolve) discard;",
            );
        };
        m.customProgramCacheKey = () => "pitch-ball-dissolve-v1";
        return m;
      });
      const mesh = new THREE.Mesh(
        footballGeometry(map.toys.find((t) => t.id === id)!.radius),
        materials,
      );
      mesh.name = id;
      balls.set(id, { mesh, dissolve, materials });
      // WorldView owns toy geometry/material disposal.
      return mesh;
    },
    scenery(scene: THREE.Scene) {
      for (const pitch of pitches) {
        const c = pitchConfig(pitch),
          root = boardSource.clone(true);
        root.name = `${pitch.id}:scoreboard`;
        root.userData.worldObject = pitch.id;
        root.position.set(
          pitch.position.x - 5,
          pitch.position.y,
          pitch.position.z - c.halfWidth - 3,
        );
        const digits = new THREE.InstancedMesh(
          segmentGeometry,
          digitMaterial,
          84,
        );
        digits.name = "Modeled score digits";
        digits.frustumCulled = false;
        root.add(digits);
        updateDigits(digits, [0, 0]);
        markSilhouetteOccluder(root);
        boards.set(pitch.id, { root, digits, last: "" });
        scene.add(root);
        const goals = [];
        for (const sign of [-1, 1]) {
          const goal = goalSource.clone(true),
            impact = { value: 0 };
          goal.name = `${pitch.id}:goal:${sign > 0 ? "burgundy" : "gold"}`;
          goal.userData.worldObject = pitch.id;
          goal.position.set(
            pitch.position.x + sign * (c.halfLength + 0.45),
            pitch.position.y,
            pitch.position.z,
          );
          goal.rotation.y = sign < 0 ? Math.PI : 0;
          goal.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return;
            if (o.name === "goal-net") {
              const m = (o.material as THREE.MeshStandardMaterial).clone();
              owned.add(m);
              o.material = m;
              m.onBeforeCompile = (shader) => {
                shader.uniforms.netImpact = impact;
                shader.vertexShader = shader.vertexShader
                  .replace(
                    "#include <common>",
                    "#include <common>\nuniform float netImpact;",
                  )
                  .replace(
                    "#include <begin_vertex>",
                    "#include <begin_vertex>\ntransformed.x += netImpact * smoothstep(0.0,1.3,position.x) * 0.14;",
                  );
              };
              m.customProgramCacheKey = () => "soccer-net-impact-v2";
            } else markSilhouetteOccluder(o);
          });
          scene.add(goal);
          goals.push({ sign, root: goal, impact });
        }
        nets.set(pitch.id, goals);
      }
    },
    frame(context: Parameters<NonNullable<VisualOptions["frame"]>>[0]) {
      for (const pitch of pitches) {
        const value = context.state.objects?.instances[pitch.id];
        if (!value) continue;
        const state = pitchState(value),
          age =
            (context.presentationTick ?? context.state.tick) - state.started;
        const ball = balls.get(pitchConfig(pitch).ball);
        if (ball) {
          ball.dissolve.value =
            state.phase === "goal"
              ? Math.max(
                  0,
                  Math.min(1, (age - GOAL_HOLD_TICKS) / GOAL_DISSOLVE_TICKS),
                )
              : 0;
          const opacity =
            state.phase === "return"
              ? Math.max(0, Math.min(1, age / BALL_RETURN_TICKS))
              : 1;
          ball.mesh.visible =
            !context.reducedMotion ||
            state.phase === "play" ||
            (state.phase === "goal" && age < GOAL_HOLD_TICKS);
          for (const m of ball.materials)
            m.opacity = context.reducedMotion ? 1 : opacity;
        }
        for (const net of nets.get(pitch.id) ?? []) {
          const scored =
            state.phase === "goal" &&
            Math.sign(state.anchor.x - pitch.position.x) === net.sign;
          net.impact.value =
            scored && !context.reducedMotion
              ? Math.sin(age * 0.7) * Math.exp(-age / 10)
              : 0;
        }
        const board = boards.get(pitch.id),
          key = `${state.burgundy}:${state.gold}`;
        if (board && board.last !== key) {
          board.last = key;
          updateDigits(board.digits, [state.burgundy, state.gold]);
        }
      }
    },
    dispose() {
      for (const board of boards.values()) board.root.removeFromParent();
      for (const goals of nets.values())
        for (const goal of goals) goal.root.removeFromParent();
      for (const resource of owned) resource.dispose();
      boards.clear();
      balls.clear();
      owned.clear();
      nets.clear();
    },
  };
}
