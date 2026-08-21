import { describe, expect, it } from "vitest";
import type { TeamCanvasPhysicsFrame } from "../physics";
import { ClientPhysicsWorld } from "./engine";

function frame(): TeamCanvasPhysicsFrame {
  return {
    v: 1,
    teamId: "team-one",
    weekKey: "2026-08-17",
    sceneId: "top-down-field",
    sequence: 0,
    bodies: [
      {
        id: "ball-one",
        assetId: "soccer",
        position: { x: 50, y: 50 },
        velocity: { x: 0, y: 0 },
        size: 52,
        angle: 0,
        angularVelocity: 0,
        sleeping: false,
        recovering: false,
        resetCount: 0,
      },
    ],
    avatars: [{ playerId: "player-one", position: { x: 35, y: 50 } }],
    resets: [],
  };
}

describe("client Team Canvas physics", () => {
  it("kicks a circular body from a swept avatar without dragging it", () => {
    const world = new ClientPhysicsWorld(frame());
    world.moveAvatar("player-one", { x: 60, y: 50 }, 200);
    for (let step = 0; step < 20; step++) world.step(1 / 60);

    const result = world.frame();
    expect(result.bodies[0].position.x).toBeGreaterThan(55);
    expect(result.bodies[0].velocity.x).toBeGreaterThan(8);
    expect(result.avatars[0].position.x).toBe(60);
  });

  it("resolves body overlap and applies scene gravity locally", () => {
    const initial = frame();
    initial.sceneId = "side-view";
    initial.bodies.push({
      ...initial.bodies[0],
      id: "ball-two",
      position: { x: 51, y: 50 },
    });
    const world = new ClientPhysicsWorld(initial);
    world.step(1 / 60);
    const result = world.frame();

    expect(result.bodies[0].position.y).toBeGreaterThan(50);
    expect(
      Math.abs(result.bodies[0].position.x - result.bodies[1].position.x),
    ).toBeGreaterThan(10);
  });

  it("rejects a stale canonical reconciliation", () => {
    const world = new ClientPhysicsWorld(frame());
    world.step(1 / 60);
    const sequence = world.frame().sequence;

    expect(world.reconcile({ ...frame(), sequence: 0 })).toBe(false);
    expect(world.frame().sequence).toBe(sequence);
  });

  it("adopts a durable owner transform without carrying old velocity", () => {
    const world = new ClientPhysicsWorld(frame());
    world.transformBody("ball-one", {
      x: 70,
      y: 35,
      size: 60,
      rotation: 144,
    });

    expect(world.frame().bodies[0]).toMatchObject({
      position: { x: 70, y: 35 },
      velocity: { x: 0, y: 0 },
      size: 60,
      angle: 144,
    });
  });

  it("accepts a canonical scene change and rejects an untrusted one", () => {
    const world = new ClientPhysicsWorld(frame());
    const changed = { ...frame(), sceneId: "space" as const, sequence: 1 };

    expect(world.reconcile(changed)).toBe(false);
    expect(world.reconcile(changed, true)).toBe(true);
    expect(world.frame().sceneId).toBe("space");
  });
});
