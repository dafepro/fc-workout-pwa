import * as THREE from "three";
import { loadActionKit } from "../../app/team-world/adapters/characters";
import { installCharacterSilhouette } from "../../app/team-world/adapters/character-occlusion";
import { initialSimulation } from "zmap/core";
const kit = await loadActionKit(() => {});
const params = new URLSearchParams(location.search);
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
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: "#a6b5a3" }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.006;
scene.add(floor, new THREE.GridHelper(200, 400, "#718170", "#8f9f8b"));
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
function pose(i: number, kick = 0, speed = 4.6) {
  character.object.position.z = (i / 60) * speed;
  camera.position.set(6, 5, 8 + (i / 60) * speed);
  camera.lookAt(0, 1, (i / 60) * speed);
  character.object.rotation.y = 0;
  character.update(
    {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: speed,
      facing: character.object.rotation.y,
      gesture: 0,
      kick,
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
export function kickFrame(frame: number) {
  pose(
    ++clock,
    Math.max(0, 0.5 - frame / 60),
    params.get("moving") === "1" ? 5.4 : 0,
  );
  renderAngle(Number(angleControl.value));
}
export function measurements(label: string) {
  const bone = (name: string) => character.object.getObjectByName(name)!;
  const sole = { foot_L: Infinity, foot_R: Infinity };
  character.object.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh) || object.userData.comicOutline)
      return;
    const indices = object.geometry.getAttribute("skinIndex"),
      weights = object.geometry.getAttribute("skinWeight");
    for (let i = 0; i < indices.count; i++)
      for (let j = 0; j < 4; j++) {
        const name = object.skeleton.bones[indices.getComponent(i, j)].name;
        if (
          (name !== "foot_L" && name !== "foot_R") ||
          weights.getComponent(i, j) < 0.9999
        )
          continue;
        const point = object
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(object.matrixWorld);
        sole[name] = Math.min(sole[name], point.y);
      }
  });
  return {
    label,
    worldZ: character.object.position.z,
    rightThigh: bone("leg_R").rotation.x,
    chestLean: bone("chest").rotation.x,
    leftSole: sole.foot_L,
    rightSole: sole.foot_R,
    chestYaw: bone("chest").rotation.y,
    leftArm: bone("arm_L").rotation.z,
    rightKnee: bone("shin_R").rotation.x,
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
  for (let i = 0; i < 60; i++) kickFrame(60);
  const baseline = measurements("Baseline");
  for (let i = 0; i <= 58; i++) {
    kickFrame(i);
    const label = stages.get(i);
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
  camera.zoom = 1.35;
  camera.position.set(
    Math.sin(angle) * 8,
    1.3,
    Math.cos(angle) * 8 + character.object.position.z,
  );
  camera.lookAt(0, 1.05, character.object.position.z);
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
