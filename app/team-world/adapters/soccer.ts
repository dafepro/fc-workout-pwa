import * as THREE from "three";
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
    {
      root: THREE.Group;
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
      last: string;
    }
  >();
  const owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  return {
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
          root = new THREE.Group();
        root.name = `${pitch.id}-scoreboard`;
        root.position.set(
          pitch.position.x,
          0,
          pitch.position.z - c.halfWidth - 1.2,
        );
        root.rotation.y = Math.PI / 4;
        const canvas = document.createElement("canvas");
        canvas.width = 768;
        canvas.height = 256;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const geometry = new THREE.PlaneGeometry(5.4, 1.8),
          material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            toneMapped: false,
          });
        const board = new THREE.Mesh(geometry, material);
        board.position.y = 3;
        root.add(board);
        const postGeometry = new THREE.BoxGeometry(0.1, 3, 0.1),
          postMaterial = new THREE.MeshStandardMaterial({
            color: "#263b36",
            roughness: 0.9,
          });
        for (const x of [-2.2, 2.2]) {
          const post = new THREE.Mesh(postGeometry, postMaterial);
          post.position.set(x, 1.5, 0);
          root.add(post);
        }
        owned.push(geometry, material, texture, postGeometry, postMaterial);
        boards.set(pitch.id, { root, canvas, texture, last: "" });
        scene.add(root);
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
        const board = boards.get(pitch.id),
          key = `${state.burgundy}:${state.gold}`;
        if (board && board.last !== key) {
          board.last = key;
          const ctx = board.canvas.getContext("2d")!;
          ctx.fillStyle = "#0a3034";
          ctx.fillRect(0, 0, 768, 256);
          ctx.fillStyle = "#8c354f";
          ctx.fillRect(16, 16, 360, 224);
          ctx.fillStyle = "#b88a32";
          ctx.fillRect(392, 16, 360, 224);
          ctx.textAlign = "center";
          ctx.fillStyle = "#fff8df";
          ctx.font = "bold 28px sans-serif";
          ctx.fillText("BURGUNDY", 196, 59);
          ctx.fillText("GOLD", 572, 59);
          ctx.font = "bold 112px sans-serif";
          ctx.fillText(String(state.burgundy), 196, 190);
          ctx.fillText(String(state.gold), 572, 190);
          board.texture.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const board of boards.values()) board.root.removeFromParent();
      for (const resource of owned) resource.dispose();
      boards.clear();
      balls.clear();
      owned.length = 0;
    },
  };
}
