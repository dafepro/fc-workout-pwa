import type {
  AvatarPointerOptions,
  RoomSessionRates,
} from "@canvas-physics/client";

export const sharedLoungeRates = Object.freeze({
  inputHz: 60,
  deltaHz: 20,
  keyframeHz: 2,
  checkpointHz: 1,
}) satisfies RoomSessionRates;

export function sharedLoungePointerOptions(): Omit<
  AvatarPointerOptions,
  "avatarPosition"
> {
  return {
    mode: "avatarDrag",
    deadZonePx: 2,
    grabRadiusPx: 36,
    flick: false,
  };
}

export function ignoreLoungePointerTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-canvas-pointer-ignore]") !== null
  );
}
