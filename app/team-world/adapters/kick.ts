import * as THREE from "three";
import type { AvatarInstance } from "@zmap/avatar-studio";
/** Apply after locomotion; the next avatar update restores the base rig pose. */
export function poseKick(
  avatar: AvatarInstance,
  remaining: number,
  reducedMotion: boolean,
) {
  if (reducedMotion || remaining <= 0 || remaining > 0.5) return;
  const sockets = avatar.attachmentView()?.sockets;
  if (!sockets) return;
  const progress = 1 - remaining / 0.5;
  const weight = Math.sin(Math.PI * progress);
  const swing =
    progress < 0.18
      ? (0.4 * progress) / 0.18
      : -1.25 * Math.sin((Math.PI * (progress - 0.18)) / 0.82);
  for (const [name, angle] of [
    ["leg_R", swing],
    ["shin_R", 0.2],
    ["foot_R", -0.15],
    ["leg_L", 0.08],
    ["shin_L", 0.1],
  ] as const) {
    const bone = sockets.get(name);
    if (bone)
      bone.quaternion.slerp(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)),
        weight,
      );
  }
}
