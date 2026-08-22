import { describe, expect, it } from "vitest";
import { avatarReleaseVelocity, stepAvatarMomentum } from "./avatar-momentum";

describe("Team Canvas avatar release momentum", () => {
  it("leaves a still or barely moving avatar where it was released", () => {
    expect(
      avatarReleaseVelocity([
        { position: { x: 40, y: 50 }, at: 100 },
        { position: { x: 40.5, y: 50.2 }, at: 180 },
      ]),
    ).toEqual({ x: 0, y: 0 });
  });

  it("carries a deliberate release in its recent direction with a safe cap", () => {
    const velocity = avatarReleaseVelocity([
      { position: { x: 25, y: 60 }, at: 100 },
      { position: { x: 45, y: 50 }, at: 200 },
    ]);

    expect(velocity.x).toBeGreaterThan(0);
    expect(velocity.y).toBeLessThan(0);
    expect(Math.hypot(velocity.x, velocity.y)).toBeLessThanOrEqual(85);
  });

  it("advances, damps, and keeps a released avatar inside the board", () => {
    const first = stepAvatarMomentum(
      { position: { x: 50, y: 50 }, velocity: { x: 60, y: 0 } },
      1 / 60,
    );
    const bounced = stepAvatarMomentum(
      { position: { x: 93.8, y: 50 }, velocity: { x: 60, y: 0 } },
      1 / 30,
    );

    expect(first.position.x).toBeGreaterThan(50);
    expect(first.velocity.x).toBeLessThan(60);
    expect(bounced.position.x).toBeLessThanOrEqual(94);
    expect(bounced.velocity.x).toBeLessThan(0);
  });
});
