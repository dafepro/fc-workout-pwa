import * as THREE from "three";
import { loadActionKit } from "../../app/team-world/adapters/characters";
import { installCharacterSilhouette } from "../../app/team-world/adapters/character-occlusion";
import { initialSimulation } from "zmap/core";
const kit = await loadActionKit(() => {});
const character = kit.character({
  id: "motion",
  name: "Teammate",
  appearance: "burgundy",
});
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bbcbbb");
scene.add(character.object);
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 80);
camera.position.set(6, 5, 8);
camera.lookAt(0, 1, 0);
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
  reducedMotion: false,
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
  character.object.position.z = (i / 60) * 4.6;
  camera.position.set(6, 5, 8 + (i / 60) * 4.6);
  camera.lookAt(0, 1, (i / 60) * 4.6);
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

document.querySelector("#kick")!.addEventListener("click", () => {
  for (let i = 0; i <= 30; i += 3) {
    pose(120 + i, Math.max(0, 0.5 - i / 60), 0);
    const image = new Image();
    image.width = 240;
    image.src = renderer.domElement.toDataURL();
    document.body.appendChild(image);
  }
  document.querySelector("#result")!.textContent = "kick complete";
});
