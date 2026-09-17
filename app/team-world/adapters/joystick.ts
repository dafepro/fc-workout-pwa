import { WALK_SPEED, SPRINT_SPEED } from "zmap";

export const WALK_RING = 30;
export const SPRINT_RING = 40;
export function joystickIntent(dx: number, dy: number, automatic = true) {
  const distance = Math.hypot(dx, dy);
  const walk = Math.max(0, Math.min(1, (distance - 5) / (WALK_RING - 5)));
  const sprint = automatic
    ? Math.max(
        0,
        Math.min(1, (distance - WALK_RING) / (SPRINT_RING - WALK_RING)),
      )
    : 0;
  return {
    x: distance ? dx / distance : 0,
    z: distance ? dy / distance : 0,
    speed: WALK_SPEED * walk + (SPRINT_SPEED - WALK_SPEED) * sprint,
  };
}
