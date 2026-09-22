import * as THREE from "three";
import { loadActionKit } from "../../app/team-world/adapters/characters";
import { installCharacterSilhouette } from "../../app/team-world/adapters/character-occlusion";
import { initialSimulation } from "zmap/core";
import { aerialSimulation } from "./aerial-simulation";
const kit = await loadActionKit(() => {});
const params = new URLSearchParams(location.search);
const floorY = Number(params.get("floor") ?? 0);
const strikeStyle = params.get("strike");
const simulated =
  params.get("simulation") === "1" &&
  (strikeStyle === "header" || strikeStyle === "bicycle")
    ? aerialSimulation(strikeStyle, params.get("moving") === "1", floorY)
    : undefined;
const angleControl = (() => {
  const element = document.querySelector("#angle");
  if (!(element instanceof HTMLSelectElement))
    throw new Error("Missing view selector");
  return element;
})();
const character = kit.character({
  id: "motion",
  name: "Teammate",
  appearance: params.get("appearance") ?? "burgundy",
});
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bbcbbb");
scene.add(character.object);
kit.scenery(
  scene,
  simulated?.map ?? {
    version: 1,
    id: "review-floor",
    bounds: { x: -100, z: -100, width: 200, depth: 200 },
    spawn: { x: 0, y: floorY, z: 0 },
    surfaces: [
      {
        id: "floor",
        x: -100,
        z: -100,
        width: 200,
        depth: 200,
        y: floorY,
        thickness: 0.2,
      },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
  },
);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: "#a6b5a3" }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = floorY - 0.006;
const grid = new THREE.GridHelper(200, 400, "#718170", "#8f9f8b");
grid.position.y = floorY;
scene.add(floor, grid);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 16, 12),
  new THREE.MeshBasicMaterial({ color: "#fcf3d4", wireframe: true }),
);
ball.visible = false;
scene.add(ball);
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 80);
camera.position.set(6, 5, 8);
camera.lookAt(0, 1, character.object.position.z);
const renderer = new THREE.WebGLRenderer({
  preserveDrawingBuffer: true,
  antialias: false,
});
renderer.setSize(480, 480);
renderer.setPixelRatio(1);
document.querySelector("#view")!.appendChild(renderer.domElement);
installCharacterSilhouette(scene);
const state = { tick: 0, players: {}, toys: {}, triggers: {} } as ReturnType<
  typeof initialSimulation
>;
const context = {
  session: "motion",
  state,
  reducedMotion: params.get("reduced") === "1",
  viewport: new THREE.Vector2(480, 480),
};
function hash() {
  const gl = renderer.getContext(),
    bytes = new Uint8Array(480 * 480 * 4);
  gl.readPixels(0, 0, 480, 480, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  let h = 0;
  for (const b of bytes) h = (Math.imul(h, 31) + b) | 0;
  return h;
}
function pose(i: number, kick = 0, speed = 4.6, strikeFrame?: number) {
  character.object.position.z = (i / 60) * speed;
  const style = params.get("strike");
  const jumpHeight = style === "header" ? 0.44 : style === "bicycle" ? 0.69 : 0;
  const age = (strikeFrame ?? 0) / 60;
  ball.visible = strikeFrame !== undefined && !!jumpHeight;
  ball.position.set(
    0.7,
    floorY + (style === "header" ? 2.1 : 3) - 9 * (age - 0.2) ** 2,
    (i / 60) * speed + 0.6 + Math.max(0, age - 0.2) * 5,
  );
  ball.position.y = Math.max(floorY + 0.3, ball.position.y);
  character.object.position.y =
    floorY +
    (strikeFrame === undefined || !jumpHeight
      ? 0
      : Math.max(0, Math.sqrt(36 * jumpHeight) * age - 9 * age * age));
  camera.position.set(6, 5, 8 + (i / 60) * speed);
  camera.lookAt(0, 1, (i / 60) * speed);
  character.object.rotation.y = 0;
  character.update(
    {
      x: 0,
      y: character.object.position.y,
      z: character.object.position.z,
      vx: 0,
      vy:
        character.object.position.y > floorY
          ? Math.sqrt(36 * jumpHeight) - 18 * age
          : 0,
      vz: speed,
      facing: character.object.rotation.y,
      gesture: 0,
      kick,
      ...(strikeFrame === undefined || !jumpHeight
        ? {}
        : {
            strike: {
              toy: "review-ball",
              kind:
                style === "header" ? ("header" as const) : ("bicycle" as const),
              target: {
                x:
                  params.get("crossing") === "1"
                    ? age < 0.1
                      ? -0.001
                      : 0.001
                    : 0.7,
                y: floorY + (style === "header" ? 2.1 : 3),
                z: (i / 60) * speed + 0.6,
              },
              jumpHeight,
            },
          }),
    },
    i / 60,
    context,
  );
  renderer.render(scene, camera);
}
pose(0);
document.querySelector("#result")!.textContent = "ready";
document.querySelector("#run")!.addEventListener("click", () => {
  const differences: number[] = [];
  for (let i = 1; i <= 120; i++) {
    pose(i);
    const first = hash();
    const before = renderer.domElement.toDataURL();
    renderer.render(scene, camera);
    if (i % 15 === 0) {
      const image = new Image();
      image.width = 240;
      image.src = before;
      document.body.appendChild(image);
    }
    if (first !== hash()) {
      differences.push(i);
      if (differences.length === 1) {
        for (const src of [before, renderer.domElement.toDataURL()]) {
          const image = new Image();
          image.src = src;
          document.body.appendChild(image);
        }
      }
    }
  }
  document.querySelector("#result")!.textContent = JSON.stringify({
    differences,
  });
});

let clock = 3;
const stages = new Map([
  [7, "Plant"],
  [12, "Strike"],
  [18, "Follow through"],
  [25, "Flight"],
  [35, "Right-foot landing"],
  [58, "Recover"],
]);
const aerialStages = new Map(
  strikeStyle === "header"
    ? [
        [4, "Load"],
        [8, "Rise"],
        [12, "Strike"],
        [18, "Follow through"],
        [27, "Landing"],
        [57, "Recover"],
      ]
    : [
        [4, "Coil"],
        [8, "Scissor"],
        [12, "Strike"],
        [18, "Follow through"],
        [35, "Landing"],
        [45, "Push up"],
        [72, "Recover"],
      ],
);
export function kickFrame(frame: number) {
  if (simulated) {
    const index = Math.min(Math.floor(frame / 2), simulated.frames.length - 1);
    const snapshot = simulated.frames[index],
      next = simulated.frames[Math.min(index + 1, simulated.frames.length - 1)];
    const body = { ...snapshot.players.motion };
    const alpha = frame / 2 - Math.floor(frame / 2);
    for (const key of ["x", "y", "z", "vx", "vy", "vz", "kick"] as const)
      body[key] = THREE.MathUtils.lerp(
        body[key] ?? 0,
        next.players.motion[key] ?? 0,
        alpha,
      );
    Object.assign(state, snapshot);
    character.object.position.set(body.x, body.y, body.z);
    character.object.rotation.y = body.facing;
    const toy = { ...snapshot.toys["review-ball"] };
    for (const key of ["x", "y", "z"] as const)
      toy[key] = THREE.MathUtils.lerp(
        toy[key],
        next.toys["review-ball"][key],
        alpha,
      );
    ball.visible = true;
    ball.position.set(toy.x, toy.y + 0.3, toy.z);
    character.update(body, ++clock / 60, context);
    renderAngle(Number(angleControl.value));
    return;
  }
  pose(
    ++clock,
    Math.max(0, 0.5 - frame / 60),
    params.get("moving") === "1" ? 5.4 : 0,
    frame,
  );
  renderAngle(Number(angleControl.value));
}
export function measurements(label: string) {
  const bone = (name: string) => character.object.getObjectByName(name)!;
  const sole = { foot_L: Infinity, foot_R: Infinity };
  let minimumY = Infinity;
  character.object.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh) || object.userData.comicOutline)
      return;
    const indices = object.geometry.getAttribute("skinIndex"),
      weights = object.geometry.getAttribute("skinWeight");
    for (let i = 0; i < indices.count; i++) {
      const point = object
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(object.matrixWorld);
      minimumY = Math.min(minimumY, point.y);
      for (let j = 0; j < 4; j++) {
        const name = object.skeleton.bones[indices.getComponent(i, j)].name;
        if (
          (name !== "foot_L" && name !== "foot_R") ||
          weights.getComponent(i, j) < 0.9999
        )
          continue;
        sole[name] = Math.min(sole[name], point.y);
      }
    }
  });
  const joints = Object.fromEntries(
    [
      "hips",
      "chest",
      "head",
      "leg_L",
      "leg_R",
      "shin_L",
      "shin_R",
      "foot_L",
      "foot_R",
      "hand_L",
      "hand_R",
    ].map((name) => [
      name,
      bone(name).getWorldPosition(new THREE.Vector3()).toArray(),
    ]),
  );
  const forehead = bone("head").localToWorld(new THREE.Vector3(0, 0.12, 0.12));
  const boot = bone("foot_R").localToWorld(new THREE.Vector3(0, 0, 0.17));
  return {
    label,
    worldZ: character.object.position.z,
    worldY: character.object.position.y,
    rightThigh: bone("leg_R").rotation.x,
    chestLean: bone("chest").rotation.x,
    leftSole: sole.foot_L,
    rightSole: sole.foot_R,
    chestYaw: bone("chest").rotation.y,
    leftArm: bone("arm_L").rotation.z,
    rightKnee: bone("shin_R").rotation.x,
    leftThigh: bone("leg_L").rotation.x,
    minimumY,
    joints,
    forehead: forehead.toArray(),
    boot: boot.toArray(),
    target: state.players.motion?.strike?.target,
    strike: state.players.motion?.strike?.kind,
    ballVelocity: state.toys["review-ball"]
      ? [
          state.toys["review-ball"].vx,
          state.toys["review-ball"].vy,
          state.toys["review-ball"].vz,
        ]
      : undefined,
  };
}
let playing = false,
  animationFrame = 0;
const cards = document.createElement("div");
cards.style.cssText = "display:flex;flex-wrap:wrap;gap:12px";
document.body.appendChild(cards);
document.querySelector("#kick")!.addEventListener("click", () => {
  playing = false;
  cancelAnimationFrame(animationFrame);
  cards.replaceChildren();
  const poses = [];
  for (let i = 0; i < 100; i++) kickFrame(100);
  const baseline = measurements("Baseline");
  for (let i = 0; i <= 86; i++) {
    kickFrame(i);
    const label = (strikeStyle ? aerialStages : stages).get(i);
    if (!label) continue;
    poses.push(measurements(label));
    const card = document.createElement("figure");
    card.style.cssText = "margin:0; width:240px";
    const caption = document.createElement("figcaption");
    caption.textContent = label;
    card.appendChild(caption);
    for (const [angle, view] of [
      [0, "front"],
      [90, "right side"],
      [145, "rear three-quarter"],
    ] as const) {
      const image = new Image();
      image.width = 240;
      image.alt = `${label}: ${view}`;
      image.src = captureAngle(angle);
      card.appendChild(image);
    }
    cards.appendChild(card);
  }
  document.querySelector("#result")!.textContent = JSON.stringify({
    status: "kick complete",
    baseline,
    poses,
  });
});
document.querySelector("#play")!.addEventListener("click", () => {
  playing = !playing;
  cancelAnimationFrame(animationFrame);
  if (!playing) return;
  camera.position.set(5, 2.8, 7 + character.object.position.z);
  camera.lookAt(0, 1, character.object.position.z);
  let frame = 0,
    last = performance.now(),
    accumulated = 0;
  function animate(now: number) {
    if (!playing) return;
    const slow = (document.querySelector("#slow") as HTMLInputElement).checked;
    accumulated += Math.min(100, now - last);
    last = now;
    const step = slow ? 50 : 1000 / 60;
    while (accumulated >= step) {
      kickFrame(frame++ % 100);
      accumulated -= step;
    }
    animationFrame = requestAnimationFrame(animate);
  }
  animationFrame = requestAnimationFrame(animate);
});

function renderAngle(degrees: number) {
  const angle = THREE.MathUtils.degToRad(degrees);
  camera.zoom = params.get("strike") ? 1 : 1.35;
  camera.position.set(
    Math.sin(angle) * 8,
    floorY + 1.3,
    Math.cos(angle) * 8 + character.object.position.z,
  );
  camera.lookAt(
    0,
    floorY + (strikeStyle ? 1.4 : 1.05),
    character.object.position.z,
  );
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
angleControl.addEventListener("change", () => {
  renderAngle(Number(angleControl.value));
});
export function captureAngle(degrees: number) {
  const saved = camera.clone();
  renderAngle(degrees);
  const image = renderer.domElement.toDataURL();
  camera.copy(saved);
  renderer.render(scene, camera);
  return image;
}

const frameControl = document.querySelector<HTMLInputElement>("#frame")!;
frameControl.addEventListener("input", () => {
  playing = false;
  cancelAnimationFrame(animationFrame);
  for (let i = 0; i < 100; i++) kickFrame(100);
  for (let i = 0; i <= Number(frameControl.value); i++) kickFrame(i);
  document.querySelector("#frame-time")!.textContent =
    `${(Number(frameControl.value) / 60).toFixed(2)}s`;
});
const styleControl = document.querySelector("#strike");
if (!(styleControl instanceof HTMLSelectElement))
  throw new Error("Missing strike selector");
styleControl.value = strikeStyle ?? "ground";
styleControl.addEventListener("change", () => {
  const url = new URL(location.href);
  if (styleControl.value === "ground") {
    url.searchParams.delete("strike");
    url.searchParams.delete("simulation");
  } else {
    url.searchParams.set("strike", styleControl.value);
    url.searchParams.set("simulation", "1");
  }
  location.href = url.toString();
});
