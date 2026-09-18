import * as THREE from "three";
import type { AvatarInstance } from "@zmap/avatar-studio";

type Angles = readonly [number, number, number];
type Pose = {
  at: number;
  hips: Angles;
  chest: Angles;
  head: Angles;
  arm_L: Angles;
  arm_R: Angles;
  forearm_L: Angles;
  forearm_R: Angles;
  leg_L: Angles;
  leg_R: Angles;
  shin_L: Angles;
  shin_R: Angles;
  foot_L: Angles;
  foot_R: Angles;
  lift: number;
};
// Right-foot instep drive: plant, strike, turn through, hop, absorb, recover.
const poses: readonly Pose[] = [
  {
    at: 0.115,
    hips: [-0.08, 0.4, -0.08],
    chest: [-0.1, -0.45, -0.12],
    head: [0.14, 0.1, 0.03],
    arm_L: [-0.65, -0.25, -0.85],
    arm_R: [1.05, 0.15, 0.65],
    forearm_L: [-0.55, 0, 0],
    forearm_R: [-0.75, 0, 0],
    leg_L: [-0.16, 0, 0.02],
    leg_R: [0.95, -0.12, -0.08],
    shin_L: [0.28, 0, 0],
    shin_R: [1.9, 0, 0],
    foot_L: [-0.12, 0, 0],
    foot_R: [0.15, 0, 0],
    lift: 0,
  },
  {
    at: 0.2,
    hips: [0, 0.02, -0.04],
    chest: [0.22, -0.04, -0.06],
    head: [-0.12, 0, 0],
    arm_L: [-0.9, -0.1, -0.35],
    arm_R: [0.35, 0.05, 0.55],
    forearm_L: [-0.6, 0, 0],
    forearm_R: [-0.85, 0, 0],
    leg_L: [-0.08, 0, 0.02],
    leg_R: [-0.65, 0.05, -0.05],
    shin_L: [0.22, 0, 0],
    shin_R: [0.12, 0, 0],
    foot_L: [-0.14, 0, 0],
    foot_R: [0.35, 0, 0],
    lift: 0,
  },
  {
    at: 0.3,
    hips: [0.06, -0.5, 0.08],
    chest: [0.3, 0.27, 0.08],
    head: [-0.14, 0.06, -0.04],
    arm_L: [-1.05, 0.45, 0.28],
    arm_R: [0.7, -0.2, 0.6],
    forearm_L: [-0.95, 0, 0],
    forearm_R: [-0.5, 0, 0],
    leg_L: [0.22, 0, 0],
    leg_R: [-1.4, 0.18, 0.04],
    shin_L: [0.3, 0, 0],
    shin_R: [0.15, 0, 0],
    foot_L: [0.25, 0, 0],
    foot_R: [0.25, 0, 0],
    lift: 0,
  },
  {
    at: 0.42,
    hips: [0, -0.4, 0.02],
    chest: [0.12, 0.2, 0.08],
    head: [-0.08, 0.08, -0.04],
    arm_L: [-0.85, 0.3, 0.24],
    arm_R: [0.5, -0.2, 0.48],
    forearm_L: [-0.85, 0, 0],
    forearm_R: [-0.65, 0, 0],
    leg_L: [0.35, -0.1, 0],
    leg_R: [-0.6, 0.14, 0.02],
    shin_L: [1.15, 0, 0],
    shin_R: [0.55, 0, 0],
    foot_L: [-0.3, 0, 0],
    foot_R: [0.1, 0, 0],
    lift: 0.13,
  },
  {
    at: 0.58,
    hips: [0, -0.3, 0.01],
    chest: [0.24, 0.12, 0.04],
    head: [-0.16, 0.05, -0.02],
    arm_L: [-0.6, 0.2, 0.12],
    arm_R: [0.28, -0.1, 0.35],
    forearm_L: [-0.65, 0, 0],
    forearm_R: [-0.85, 0, 0],
    leg_L: [0.4, -0.12, 0],
    leg_R: [-0.4, 0.1, 0],
    shin_L: [1.1, 0, 0],
    shin_R: [0.65, 0, 0],
    foot_L: [-0.4, 0, 0],
    foot_R: [-0.25, 0, 0],
    lift: 0,
  },
  {
    at: 0.72,
    hips: [0, -0.15, 0],
    chest: [0.1, 0.05, 0.02],
    head: [-0.08, 0, 0],
    arm_L: [-0.35, 0.1, -0.15],
    arm_R: [0.12, 0, 0.2],
    forearm_L: [-0.45, 0, 0],
    forearm_R: [-0.55, 0, 0],
    leg_L: [-0.2, 0, 0],
    leg_R: [-0.14, 0.04, 0],
    shin_L: [0.7, 0, 0],
    shin_R: [0.3, 0, 0],
    foot_L: [-0.3, 0, 0],
    foot_R: [-0.16, 0, 0],
    lift: 0,
  },
  {
    at: 0.96,
    hips: [0, 0, 0],
    chest: [0.02, 0, 0],
    head: [0, 0, 0],
    arm_L: [0, 0, -0.08],
    arm_R: [0, 0, 0.08],
    forearm_L: [-0.1, 0, 0],
    forearm_R: [-0.1, 0, 0],
    leg_L: [0, 0, 0],
    leg_R: [0, 0, 0],
    shin_L: [0, 0, 0],
    shin_R: [0, 0, 0],
    foot_L: [0, 0, 0],
    foot_R: [0, 0, 0],
    lift: 0,
  },
];
const bones = Object.keys(poses[0]).filter(
  (name): name is Exclude<keyof Pose, "at" | "lift"> =>
    name !== "at" && name !== "lift",
);
const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// Shape-preserving Hermite slopes carry momentum through keys without joint overshoot.
function sample(elapsed: number, value: (pose: Pose) => number) {
  if (elapsed <= poses[0].at) return value(poses[0]);
  const index = poses.findIndex((pose) => pose.at > elapsed) - 1;
  const slope = (i: number) =>
    (value(poses[i + 1]) - value(poses[i])) / (poses[i + 1].at - poses[i].at);
  const tangent = (i: number) => {
    if (i === 0 || i === poses.length - 1) return 0;
    const before = slope(i - 1),
      after = slope(i);
    if (before * after <= 0) return 0;
    const previous = poses[i].at - poses[i - 1].at;
    const next = poses[i + 1].at - poses[i].at;
    const w1 = 2 * next + previous,
      w2 = next + 2 * previous;
    return (w1 + w2) / (w1 / before + w2 / after);
  };
  const a = poses[index],
    b = poses[index + 1];
  const duration = b.at - a.at,
    t = (elapsed - a.at) / duration;
  return (
    (2 * t ** 3 - 3 * t * t + 1) * value(a) +
    (t ** 3 - 2 * t * t + t) * duration * tangent(index) +
    (-2 * t ** 3 + 3 * t * t) * value(b) +
    (t ** 3 - t * t) * duration * tangent(index + 1)
  );
}

/** One playback per character; only the recovery outlasts the shared kick timer. */
export function createKickPose() {
  let elapsed = Infinity,
    previous = 0,
    lastTime: number | undefined;
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const origin = new THREE.Vector3(),
    point = new THREE.Vector3();
  let fittedRoot: THREE.Group | undefined;
  const soles = new Map<string, THREE.Vector3[]>();
  function sole(bone: THREE.Bone | undefined) {
    let minimum = Infinity;
    if (bone)
      for (const vertex of soles.get(bone.name) ?? []) {
        minimum = Math.min(
          minimum,
          point.copy(vertex).applyMatrix4(bone.matrixWorld).y - origin.y,
        );
      }
    return Number.isFinite(minimum) ? minimum : 0;
  }
  return (
    avatar: AvatarInstance,
    remaining: number,
    time: number,
    reducedMotion: boolean,
  ) => {
    const dt = lastTime === undefined ? 0 : time - lastTime;
    lastTime = time;
    if (reducedMotion || dt < 0 || dt > 0.25) elapsed = Infinity;
    if (!reducedMotion && remaining > 0 && remaining <= 0.5) {
      elapsed = 0.5 - remaining;
    } else if (!reducedMotion && elapsed < 0.96) {
      elapsed = Math.max(
        previous > 0 ? 0.5 : elapsed,
        elapsed + Math.max(0, dt),
      );
    }
    previous = remaining;
    const view = avatar.attachmentView();
    if (!view || elapsed >= 0.96 || reducedMotion) return;
    if (fittedRoot !== view.root) {
      fittedRoot = view.root;
      soles.clear();
      avatar.object.updateWorldMatrix(true, true);
      // Cache rigid boot vertices in ankle space, including fitted body proportions.
      view.root.traverse((object) => {
        if (
          !(object instanceof THREE.SkinnedMesh) ||
          object.userData.comicOutline
        )
          return;
        const indices = object.geometry.getAttribute("skinIndex");
        const weights = object.geometry.getAttribute("skinWeight");
        for (let i = 0; i < indices.count; i++)
          for (let j = 0; j < 4; j++) {
            if (weights.getComponent(i, j) < 0.9999) continue;
            const bone = object.skeleton.bones[indices.getComponent(i, j)];
            if (bone.name !== "foot_L" && bone.name !== "foot_R") continue;
            const vertices = soles.get(bone.name) ?? [];
            vertices.push(
              bone.worldToLocal(
                object
                  .getVertexPosition(i, new THREE.Vector3())
                  .applyMatrix4(object.matrixWorld),
              ),
            );
            soles.set(bone.name, vertices);
          }
      });
    }
    const weight =
      smooth(elapsed / 0.11) * (1 - smooth((elapsed - 0.72) / 0.24));
    for (const name of bones) {
      const bone = view.sockets.get(name);
      if (!bone) continue;
      target.setFromEuler(
        euler.set(
          sample(elapsed, (pose) => pose[name][0]),
          sample(elapsed, (pose) => pose[name][1]),
          sample(elapsed, (pose) => pose[name][2]),
        ),
      );
      bone.quaternion.slerp(target, weight);
    }
    avatar.object.getWorldPosition(origin);
    avatar.object.updateWorldMatrix(true, true);
    const left = sole(view.sockets.get("foot_L"));
    const right = sole(view.sockets.get("foot_R"));
    const lift = sample(elapsed, (pose) => pose.lift);
    // Use the actual boots so different approved bodies share the same floor.
    view.root.position.y += (lift - Math.min(left, right)) * weight;
    avatar.object.updateWorldMatrix(true, true);
  };
}
