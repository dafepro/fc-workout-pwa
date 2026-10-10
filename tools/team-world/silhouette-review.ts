import * as THREE from "three";
import {
  createCharacterOcclusion,
  installCharacterSilhouette,
  markSilhouetteOccluder,
} from "../../app/team-world/adapters/character-occlusion";
const renderer = new THREE.WebGLRenderer({
  preserveDrawingBuffer: true,
  antialias: false,
});
renderer.setSize(640, 480);
renderer.setPixelRatio(1);
document
  .querySelector<HTMLDivElement>("#view")!
  .appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#223333");
const camera = new THREE.OrthographicCamera(-3, 3, 2.25, -2.25, 0.1, 50);
camera.position.z = 10;
const root = new THREE.Group();
scene.add(root);
const bodyMaterial = new THREE.MeshBasicMaterial({ color: "#d64937" });
for (const [x, y, w, h, z] of [
  [0, 0, 1.2, 2, 0],
  [0.35, 0, 0.9, 1.4, 0.2],
  [-0.35, 0, 0.9, 1.4, 0.1],
]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), bodyMaterial);
  mesh.position.set(x, y, z);
  root.add(mesh);
}
createCharacterOcclusion().update(root);
const wall = new THREE.Mesh(
  new THREE.BoxGeometry(4, 3, 0.2),
  new THREE.MeshBasicMaterial({ color: "#808080" }),
);
wall.position.set(10, 0, 2);
scene.add(wall);
markSilhouetteOccluder(wall);
let remove: (() => void) | undefined = installCharacterSilhouette(scene);
function render() {
  renderer.render(scene, camera);
  const gl = renderer.getContext(),
    pixels = new Uint8Array(640 * 480 * 4);
  gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let hash = 2166136261;
  for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
  const sample = (x: number, y: number) =>
    Array.from(pixels.slice((y * 640 + x) * 4, (y * 640 + x) * 4 + 3));
  document.querySelector("#result")!.textContent = JSON.stringify({
    enabled: !!remove,
    hash: hash >>> 0,
    left: sample(275, 240),
    center: sample(320, 240),
    right: sample(360, 240),
  });
}
document.querySelector("#clear")!.addEventListener("click", () => {
  wall.position.x = 10;
  render();
});
document.querySelector("#covered")!.addEventListener("click", () => {
  wall.position.x = 0;
  wall.scale.x = 1;
  render();
});
document.querySelector("#partial")!.addEventListener("click", () => {
  wall.position.x = 1;
  wall.scale.x = 0.5;
  render();
});
document.querySelector("#move")!.addEventListener("click", () => {
  root.position.x += 0.15;
  root.rotation.z += 0.1;
  render();
});
document.querySelector("#toggle")!.addEventListener("click", () => {
  if (remove) {
    remove();
    remove = undefined;
  } else remove = installCharacterSilhouette(scene);
  render();
});
render();
