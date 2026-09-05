import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  AnimationClip,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  SphereGeometry,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    queueMicrotask(() => this.onloadend?.());
  }

  async readAsDataURL(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString("base64")}`;
    queueMicrotask(() => this.onloadend?.());
  }
}

global.FileReader = NodeFileReader;

const ink = material("#13284d");
const skin = material("#9d633f");
const violet = material("#6954ee");
const lime = material("#c8f52a");
const white = material("#f7fbff");

const avatar = new Group();
avatar.name = "ZoomigoAvatar";
avatar.userData = {
  rigVersion: "zoomigo-humanoid-v1",
  referenceOnly: true,
};

const hips = joint("hips", avatar, [0, 1.55, 0]);
const spine = joint("spine", hips, [0, 0.48, 0]);
const chest = joint("chest", spine, [0, 0.48, 0]);
const neck = joint("neck", chest, [0, 0.38, 0]);
const head = joint("head", neck, [0, 0.3, 0]);
const upperLegL = joint("upper_leg_l", hips, [-0.22, -0.08, 0]);
const lowerLegL = joint("lower_leg_l", upperLegL, [0, -0.62, 0]);
const footL = joint("foot_l", lowerLegL, [0, -0.6, 0.08]);
const upperLegR = joint("upper_leg_r", hips, [0.22, -0.08, 0]);
const lowerLegR = joint("lower_leg_r", upperLegR, [0, -0.62, 0]);
const footR = joint("foot_r", lowerLegR, [0, -0.6, 0.08]);
const upperArmL = joint("upper_arm_l", chest, [-0.48, 0.2, 0]);
const lowerArmL = joint("lower_arm_l", upperArmL, [-0.5, 0, 0]);
const handL = joint("hand_l", lowerArmL, [-0.42, 0, 0]);
const upperArmR = joint("upper_arm_r", chest, [0.48, 0.2, 0]);
const lowerArmR = joint("lower_arm_r", upperArmR, [0.5, 0, 0]);
const handR = joint("hand_r", lowerArmR, [0.42, 0, 0]);

part(spine, new BoxGeometry(0.86, 0.9, 0.42), violet, [0, 0.08, 0]);
part(chest, new BoxGeometry(0.94, 0.24, 0.46), lime, [0, 0.05, 0.01]);
part(head, new SphereGeometry(0.38, 24, 16), skin, [0, 0.14, 0]);
part(
  head,
  new SphereGeometry(0.4, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
  ink,
  [0, 0.24, 0],
);
part(head, new SphereGeometry(0.035, 12, 8), ink, [-0.13, 0.17, 0.35]);
part(head, new SphereGeometry(0.035, 12, 8), ink, [0.13, 0.17, 0.35]);

limb(upperLegL, 0.16, 0.58, violet, [0, -0.31, 0]);
limb(lowerLegL, 0.14, 0.56, skin, [0, -0.3, 0]);
part(footL, new BoxGeometry(0.3, 0.16, 0.5), white, [0, -0.04, 0.16]);
limb(upperLegR, 0.16, 0.58, violet, [0, -0.31, 0]);
limb(lowerLegR, 0.14, 0.56, skin, [0, -0.3, 0]);
part(footR, new BoxGeometry(0.3, 0.16, 0.5), white, [0, -0.04, 0.16]);

arm(upperArmL, 0.13, 0.48, violet, [-0.25, 0, 0]);
arm(lowerArmL, 0.11, 0.4, skin, [-0.22, 0, 0]);
part(handL, new SphereGeometry(0.12, 16, 10), skin, [-0.08, 0, 0]);
arm(upperArmR, 0.13, 0.48, violet, [0.25, 0, 0]);
arm(lowerArmR, 0.11, 0.4, skin, [0.22, 0, 0]);
part(handR, new SphereGeometry(0.12, 16, 10), skin, [0.08, 0, 0]);

avatar.traverse((object) => {
  if (object instanceof Mesh) {
    object.castShadow = false;
    object.receiveShadow = false;
  }
});

const clips = [
  new AnimationClip("idle_default", 2, [
    quaternionTrack("chest", [0, 1, 2], [0, 0.04, 0]),
    positionTrack(
      "hips",
      [0, 1, 2],
      [
        [0, 1.55, 0],
        [0, 1.59, 0],
        [0, 1.55, 0],
      ],
    ),
  ]),
  locomotionClip("walk", 0.8, 0.5),
  locomotionClip("run", 0.5, 0.9),
  new AnimationClip("celebration_jump", 1.2, [
    positionTrack(
      "hips",
      [0, 0.4, 0.8, 1.2],
      [
        [0, 1.55, 0],
        [0, 1.95, 0],
        [0, 1.95, 0],
        [0, 1.55, 0],
      ],
    ),
    quaternionTrack("upper_arm_l", [0, 0.25, 0.95, 1.2], [0, -2.2, -2.2, 0]),
    quaternionTrack("upper_arm_r", [0, 0.25, 0.95, 1.2], [0, 2.2, 2.2, 0]),
  ]),
];

const outputPath = resolve(
  process.cwd(),
  "public/avatar/reference/zoomigo-reference.glb",
);
await mkdir(dirname(outputPath), { recursive: true });
const data = await new GLTFExporter().parseAsync(avatar, {
  animations: clips,
  binary: true,
  onlyVisible: true,
});
await writeFile(outputPath, new Uint8Array(data));
console.log(`Wrote ${outputPath} (${data.byteLength} bytes)`);

function material(color) {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.78,
    metalness: 0.02,
  });
}

function joint(name, parent, position) {
  const node = new Object3D();
  node.name = name;
  node.position.fromArray(position);
  parent.add(node);
  return node;
}

function part(parent, geometry, partMaterial, position) {
  const mesh = new Mesh(geometry, partMaterial);
  mesh.position.fromArray(position);
  parent.add(mesh);
  return mesh;
}

function limb(parent, radius, length, partMaterial, position) {
  return part(
    parent,
    new CylinderGeometry(radius, radius * 0.88, length, 12),
    partMaterial,
    position,
  );
}

function arm(parent, radius, length, partMaterial, position) {
  const mesh = limb(parent, radius, length, partMaterial, position);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function locomotionClip(name, duration, swing) {
  const times = [0, duration / 4, duration / 2, (duration * 3) / 4, duration];
  const forward = [0, swing, 0, -swing, 0];
  const backward = forward.map((value) => -value);
  return new AnimationClip(name, duration, [
    quaternionTrack("upper_leg_l", times, forward),
    quaternionTrack("upper_leg_r", times, backward),
    quaternionTrack("upper_arm_l", times, backward),
    quaternionTrack("upper_arm_r", times, forward),
  ]);
}

function quaternionTrack(nodeName, times, xRotations) {
  const axis = new Vector3(1, 0, 0);
  const values = xRotations.flatMap((angle) =>
    new Quaternion().setFromAxisAngle(axis, angle).toArray(),
  );
  return new QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function positionTrack(nodeName, times, positions) {
  return new VectorKeyframeTrack(
    `${nodeName}.position`,
    times,
    positions.flat(),
  );
}
