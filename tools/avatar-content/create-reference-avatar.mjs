import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const projectRoot = process.cwd();
const sourcePath = resolve(
  projectRoot,
  "content/avatar/reference-library.json",
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const assetDirectory = resolve(projectRoot, "public/avatar/assets");
const catalogPath = resolve(
  projectRoot,
  "public/avatar/catalog/avatar-catalog.reference.json",
);
const factories = {
  base: createBaseAvatar,
  "hair-curl-cloud": createCurlCloud,
  "hair-swoop": createHairSwoop,
  "top-training-tee": createTop(false),
  "top-touchline-jersey": createTop(true),
  "bottom-training-shorts": createBottom(false),
  "bottom-striker-shorts": createBottom(true),
  "feet-pitch-runners": createFeet(false),
  "feet-street-cleats": createFeet(true),
  "headwear-touchline-cap": createCap,
};

await mkdir(assetDirectory, { recursive: true });
const items = [];
for (const definition of source.items) {
  const factory = factories[definition.assetKey];
  if (!factory) {
    throw new Error(`No reference asset factory for ${definition.assetKey}`);
  }
  const { scene, animations = [] } = factory(definition.id);
  const bytes = await exportGLB(scene, animations);
  const hash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(resolve(assetDirectory, `${hash}.glb`), bytes);
  const item = { ...definition };
  delete item.assetKey;
  items.push({
    ...item,
    rigVersion: source.rigVersion,
    assets: {
      lod0: {
        url: `/avatar/assets/${hash}.glb`,
        sha256: hash,
        bytes: bytes.byteLength,
      },
    },
  });
}

const catalog = {
  schemaVersion: source.schemaVersion,
  catalogVersion: source.catalogVersion,
  rigVersion: source.rigVersion,
  colors: source.colors,
  items,
};
await mkdir(dirname(catalogPath), { recursive: true });
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${items.length} avatar assets and ${catalogPath}`);

function createBaseAvatar(itemId) {
  const ink = material("#13284d");
  const skin = material("#9d633f");
  const baseCloth = material("#6954ee");
  const white = material("#f7fbff");
  const avatar = new Group();
  avatar.name = "ZoomigoAvatar";
  avatar.userData = {
    itemId,
    rigVersion: source.rigVersion,
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

  socket("socket_head", head, [0, 0.48, 0]);
  socket("socket_face", head, [0, 0.14, 0.38]);
  socket("socket_chest", chest, [0, 0.02, 0]);
  socket("socket_back", chest, [0, 0, -0.3]);
  socket("socket_hips", hips, [0, -0.12, 0]);
  socket("socket_upper_leg_l", upperLegL, [0, 0, 0]);
  socket("socket_upper_leg_r", upperLegR, [0, 0, 0]);
  socket("socket_foot_l", footL, [0, 0, 0]);
  socket("socket_foot_r", footR, [0, 0, 0]);

  bodyPart(
    spine,
    "body.torso",
    "torso",
    new BoxGeometry(0.86, 0.9, 0.42),
    baseCloth,
    [0, 0.08, 0],
  );
  part(chest, new BoxGeometry(0.94, 0.24, 0.46), skin, [0, 0.05, 0.01]);
  bodyPart(
    head,
    "body.head",
    "head_neck",
    new SphereGeometry(0.38, 24, 16),
    skin,
    [0, 0.14, 0],
  );
  part(head, new SphereGeometry(0.035, 12, 8), ink, [-0.13, 0.17, 0.35]);
  part(head, new SphereGeometry(0.035, 12, 8), ink, [0.13, 0.17, 0.35]);

  bodyLimb(
    upperLegL,
    "body.upper-leg-l",
    "upper_leg_l",
    0.16,
    0.58,
    baseCloth,
    [0, -0.31, 0],
  );
  bodyLimb(
    lowerLegL,
    "body.lower-leg-l",
    "lower_leg_foot_l",
    0.14,
    0.56,
    skin,
    [0, -0.3, 0],
  );
  part(footL, new BoxGeometry(0.3, 0.16, 0.5), white, [0, -0.04, 0.16]);
  bodyLimb(
    upperLegR,
    "body.upper-leg-r",
    "upper_leg_r",
    0.16,
    0.58,
    baseCloth,
    [0, -0.31, 0],
  );
  bodyLimb(
    lowerLegR,
    "body.lower-leg-r",
    "lower_leg_foot_r",
    0.14,
    0.56,
    skin,
    [0, -0.3, 0],
  );
  part(footR, new BoxGeometry(0.3, 0.16, 0.5), white, [0, -0.04, 0.16]);

  bodyArm(
    upperArmL,
    "body.upper-arm-l",
    "upper_arm_l",
    0.13,
    0.48,
    skin,
    [-0.25, 0, 0],
  );
  bodyArm(
    lowerArmL,
    "body.lower-arm-l",
    "lower_arm_hand_l",
    0.11,
    0.4,
    skin,
    [-0.22, 0, 0],
  );
  part(handL, new SphereGeometry(0.12, 16, 10), skin, [-0.08, 0, 0]);
  bodyArm(
    upperArmR,
    "body.upper-arm-r",
    "upper_arm_r",
    0.13,
    0.48,
    skin,
    [0.25, 0, 0],
  );
  bodyArm(
    lowerArmR,
    "body.lower-arm-r",
    "lower_arm_hand_r",
    0.11,
    0.4,
    skin,
    [0.22, 0, 0],
  );
  part(handR, new SphereGeometry(0.12, 16, 10), skin, [0.08, 0, 0]);

  return {
    scene: avatar,
    animations: [
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
        quaternionTrack(
          "upper_arm_l",
          [0, 0.25, 0.95, 1.2],
          [0, -2.2, -2.2, 0],
        ),
        quaternionTrack("upper_arm_r", [0, 0.25, 0.95, 1.2], [0, 2.2, 2.2, 0]),
      ]),
    ],
  };
}

function createCurlCloud(itemId) {
  const root = cosmeticRoot(itemId);
  const group = attachment("socket_head");
  const hair = material("#241d3d");
  for (const [x, y, z, scale] of [
    [-0.24, 0, 0, 0.2],
    [0, 0.08, 0, 0.23],
    [0.24, 0, 0, 0.2],
    [-0.13, 0.1, -0.1, 0.2],
    [0.13, 0.1, -0.1, 0.2],
  ]) {
    part(group, new SphereGeometry(scale, 16, 10), hair, [x, y, z]);
  }
  root.add(group);
  return { scene: root };
}

function createHairSwoop(itemId) {
  const root = cosmeticRoot(itemId);
  const group = attachment("socket_head");
  const hair = material("#3b251b");
  const swoop = part(
    group,
    new SphereGeometry(0.38, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hair,
    [0, -0.03, 0],
  );
  swoop.scale.set(1.12, 0.72, 1);
  const tip = part(
    group,
    new SphereGeometry(0.16, 14, 8),
    hair,
    [0.25, 0.03, 0.02],
  );
  tip.scale.set(1.5, 0.6, 0.8);
  root.add(group);
  return { scene: root };
}

function createTop(jersey) {
  return (itemId) => {
    const root = cosmeticRoot(itemId);
    const neutral = material("#d8d8d8");
    const accent = material("#f7fbff");
    const chest = attachment("socket_chest");
    tintable(
      part(chest, new BoxGeometry(0.92, 0.84, 0.48), neutral, [0, -0.38, 0]),
    );
    if (jersey) {
      part(chest, new BoxGeometry(0.94, 0.1, 0.5), accent, [0, -0.08, 0.01]);
    }
    root.add(chest);
    return { scene: root };
  };
}

function createBottom(striker) {
  return (itemId) => {
    const root = cosmeticRoot(itemId);
    const neutral = material("#d8d8d8");
    for (const socketName of ["socket_upper_leg_l", "socket_upper_leg_r"]) {
      const leg = attachment(socketName);
      const mesh = tintable(
        part(
          leg,
          new BoxGeometry(striker ? 0.38 : 0.34, 0.45, 0.42),
          neutral,
          [0, -0.25, 0],
        ),
      );
      if (striker) {
        mesh.rotation.z = socketName.endsWith("_l") ? -0.05 : 0.05;
      }
      root.add(leg);
    }
    return { scene: root };
  };
}

function createFeet(cleats) {
  return (itemId) => {
    const root = cosmeticRoot(itemId);
    const neutral = material("#d8d8d8");
    const sole = material("#13284d");
    for (const socketName of ["socket_foot_l", "socket_foot_r"]) {
      const foot = attachment(socketName);
      tintable(
        part(
          foot,
          new BoxGeometry(0.34, 0.18, cleats ? 0.58 : 0.52),
          neutral,
          [0, -0.04, 0.18],
        ),
      );
      part(
        foot,
        new BoxGeometry(0.35, 0.05, cleats ? 0.59 : 0.53),
        sole,
        [0, -0.14, 0.18],
      );
      root.add(foot);
    }
    return { scene: root };
  };
}

function createCap(itemId) {
  const root = cosmeticRoot(itemId);
  const group = attachment("socket_head");
  const neutral = material("#d8d8d8");
  const crown = tintable(
    part(
      group,
      new SphereGeometry(0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      neutral,
      [0, -0.03, 0],
    ),
  );
  crown.scale.y = 0.7;
  tintable(
    part(group, new BoxGeometry(0.46, 0.06, 0.26), neutral, [0, -0.04, 0.34]),
  );
  root.add(group);
  return { scene: root };
}

async function exportGLB(scene, animations) {
  const data = await new GLTFExporter().parseAsync(scene, {
    animations,
    binary: true,
    onlyVisible: true,
  });
  return new Uint8Array(data);
}

function cosmeticRoot(itemId) {
  const root = new Group();
  root.name = "AvatarCosmetic";
  root.userData = {
    itemId,
    rigVersion: source.rigVersion,
    referenceOnly: true,
  };
  return root;
}

function attachment(socketName) {
  const group = new Group();
  group.name = `${socketName}.attachment`;
  group.userData.socket = socketName;
  return group;
}

function socket(name, parent, position) {
  return joint(name, parent, position);
}

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

function bodyPart(parent, name, region, geometry, partMaterial, position) {
  const mesh = part(parent, geometry, partMaterial, position);
  mesh.name = name;
  mesh.userData.bodyRegion = region;
  return mesh;
}

function bodyLimb(
  parent,
  name,
  region,
  radius,
  length,
  partMaterial,
  position,
) {
  return bodyPart(
    parent,
    name,
    region,
    new CylinderGeometry(radius, radius * 0.88, length, 12),
    partMaterial,
    position,
  );
}

function bodyArm(parent, name, region, radius, length, partMaterial, position) {
  const mesh = bodyLimb(
    parent,
    name,
    region,
    radius,
    length,
    partMaterial,
    position,
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function tintable(mesh) {
  mesh.userData.tintable = true;
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
