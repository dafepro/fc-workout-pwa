import { expect, it } from "vitest";
import { WALK_SPEED, SPRINT_SPEED } from "zmap";
import { joystickIntent } from "./joystick";

it("keeps a dead zone, reaches walking at the ring and sprint after its buffer", () => {
  expect(joystickIntent(3, 0).speed).toBe(0);
  expect(joystickIntent(30, 0).speed).toBe(WALK_SPEED);
  expect(joystickIntent(35, 0).speed).toBeGreaterThan(WALK_SPEED);
  expect(joystickIntent(40, 0).speed).toBe(SPRINT_SPEED);
  expect(joystickIntent(400, 0).speed).toBe(SPRINT_SPEED);
  expect(joystickIntent(400, 0, false).speed).toBe(WALK_SPEED);
});
it("preserves diagonal direction without increasing maximum speed", () => {
  const intent = joystickIntent(40, -40);
  expect(Math.hypot(intent.x, intent.z)).toBeCloseTo(1);
  expect(intent.z).toBeLessThan(0);
  expect(intent.speed).toBe(SPRINT_SPEED);
  expect(joystickIntent(0, 0)).toEqual({ x: 0, z: 0, speed: 0 });
});
