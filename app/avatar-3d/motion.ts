import type { AvatarMotionInput, AvatarMotionState } from "./types";

const IDLE_MAX_SPEED = 0.05;
const RUN_MIN_SPEED = 2;

export function resolveAvatarMotion(
  input: AvatarMotionInput,
): AvatarMotionState {
  if (input.emote) {
    return { kind: "emote", ...input.emote };
  }
  if (input.speed <= IDLE_MAX_SPEED) return { kind: "idle" };
  if (input.speed < RUN_MIN_SPEED) return { kind: "walk" };
  return { kind: "run" };
}
