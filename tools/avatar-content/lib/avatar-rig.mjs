import {
  Bone,
  Float32BufferAttribute,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";

export const RIG_VERSION = "zoomigo-humanoid-v1";

export const CANONICAL_BONES = [
  "root",
  "hips",
  "spine_01",
  "spine_02",
  "chest",
  "neck",
  "head",
  "clavicle_l",
  "upper_arm_l",
  "lower_arm_l",
  "hand_l",
  "clavicle_r",
  "upper_arm_r",
  "lower_arm_r",
  "hand_r",
  "upper_leg_l",
  "lower_leg_l",
  "foot_l",
  "toe_l",
  "upper_leg_r",
  "lower_leg_r",
  "foot_r",
  "toe_r",
];

export const CANONICAL_SOCKETS = [
  "socket_head",
  "socket_face",
  "socket_back",
  "socket_chest",
  "socket_wrist_l",
  "socket_wrist_r",
  "socket_hand_l",
  "socket_hand_r",
  "socket_foot_l",
  "socket_foot_r",
  "socket_fx_root",
];

export function createCanonicalRig(parent, { sockets = true } = {}) {
  const bones = {};
  bones.root = bone("root", parent, [0, 0, 0]);
  bones.hips = bone("hips", bones.root, [0, 1.56, 0]);
  bones.spine_01 = bone("spine_01", bones.hips, [0, 0.3, 0]);
  bones.spine_02 = bone("spine_02", bones.spine_01, [0, 0.3, 0]);
  bones.chest = bone("chest", bones.spine_02, [0, 0.28, 0]);
  bones.neck = bone("neck", bones.chest, [0, 0.3, 0]);
  bones.head = bone("head", bones.neck, [0, 0.29, 0]);

  bones.clavicle_l = bone("clavicle_l", bones.chest, [-0.28, 0.14, 0]);
  bones.upper_arm_l = bone("upper_arm_l", bones.clavicle_l, [-0.19, -0.04, 0]);
  bones.lower_arm_l = bone("lower_arm_l", bones.upper_arm_l, [-0.45, -0.1, 0]);
  bones.hand_l = bone("hand_l", bones.lower_arm_l, [-0.4, -0.08, 0]);

  bones.clavicle_r = bone("clavicle_r", bones.chest, [0.28, 0.14, 0]);
  bones.upper_arm_r = bone("upper_arm_r", bones.clavicle_r, [0.19, -0.04, 0]);
  bones.lower_arm_r = bone("lower_arm_r", bones.upper_arm_r, [0.45, -0.1, 0]);
  bones.hand_r = bone("hand_r", bones.lower_arm_r, [0.4, -0.08, 0]);

  bones.upper_leg_l = bone("upper_leg_l", bones.hips, [-0.21, -0.07, 0]);
  bones.lower_leg_l = bone("lower_leg_l", bones.upper_leg_l, [0, -0.59, 0]);
  bones.foot_l = bone("foot_l", bones.lower_leg_l, [0, -0.56, 0.07]);
  bones.toe_l = bone("toe_l", bones.foot_l, [0, -0.08, 0.36]);

  bones.upper_leg_r = bone("upper_leg_r", bones.hips, [0.21, -0.07, 0]);
  bones.lower_leg_r = bone("lower_leg_r", bones.upper_leg_r, [0, -0.59, 0]);
  bones.foot_r = bone("foot_r", bones.lower_leg_r, [0, -0.56, 0.07]);
  bones.toe_r = bone("toe_r", bones.foot_r, [0, -0.08, 0.36]);

  if (sockets) addSockets(bones);
  parent.updateMatrixWorld(true);
  const skeleton = new Skeleton(CANONICAL_BONES.map((name) => bones[name]));
  skeleton.calculateInverses();
  return { bones, skeleton };
}

export function addSkinnedPart(
  root,
  rig,
  { name, geometry, material, boneName, userData = {} },
) {
  const vertexCount = geometry.attributes.position.count;
  const boneIndex = CANONICAL_BONES.indexOf(boneName);
  if (boneIndex < 0) throw new Error(`Unknown skinning bone ${boneName}`);
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    indices[index * 4] = boneIndex;
    weights[index * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.userData = userData;
  root.add(mesh);
  mesh.bind(rig.skeleton);
  return mesh;
}

function addSockets(bones) {
  socket("socket_head", bones.head, [0, 0.44, 0]);
  socket("socket_face", bones.head, [0, 0.12, 0.36]);
  socket("socket_back", bones.chest, [0, 0.02, -0.3]);
  socket("socket_chest", bones.chest, [0, 0, 0.29]);
  socket("socket_wrist_l", bones.lower_arm_l, [-0.37, -0.07, 0]);
  socket("socket_wrist_r", bones.lower_arm_r, [0.37, -0.07, 0]);
  socket("socket_hand_l", bones.hand_l, [-0.08, 0, 0]);
  socket("socket_hand_r", bones.hand_r, [0.08, 0, 0]);
  socket("socket_foot_l", bones.foot_l, [0, 0, 0]);
  socket("socket_foot_r", bones.foot_r, [0, 0, 0]);
  socket("socket_fx_root", bones.root, [0, 0, 0]);
}

function bone(name, parent, position) {
  const node = new Bone();
  node.name = name;
  node.position.fromArray(position);
  parent.add(node);
  return node;
}

function socket(name, parent, position) {
  const node = new Object3D();
  node.name = name;
  node.userData.socketAnchor = name;
  node.position.fromArray(position);
  parent.add(node);
  return node;
}
