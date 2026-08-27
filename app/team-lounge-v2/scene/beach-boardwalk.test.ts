import { describe, expect, it, vi } from "vitest";
import {
  validateCanvasDefinition,
  validateItemDefinition,
} from "@canvas-physics/core";
import {
  beachBallDefinition,
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
  loungeAvatarDefinition,
} from "./beach-boardwalk";

describe("Beach Boardwalk Canvas scene", () => {
  it("is a valid versioned room with one immutable kickable attraction", () => {
    expect(validateCanvasDefinition(beachBoardwalkCanvas)).toEqual({
      ok: true,
    });
    for (const definition of beachBoardwalkDefinitions) {
      expect(validateItemDefinition(definition, new Set(["kickable"]))).toEqual(
        { ok: true },
      );
    }

    expect(beachBoardwalkCanvas.systemItems).toEqual([
      expect.objectContaining({
        entityId: "boardwalk-beach-ball",
        definitionId: "beach-ball",
      }),
    ]);
    expect(
      beachBoardwalkDefinitions.find(
        ({ definitionId }) => definitionId === "beach-ball",
      ),
    ).toEqual(
      expect.objectContaining({
        behaviorType: "kickable",
        colliders: expect.arrayContaining([
          expect.objectContaining({ id: "solid", collisionMask: 31 }),
        ]),
      }),
    );
  });

  it("reserves one non-complex item slot per avatar-day plus the ball", () => {
    expect(beachBoardwalkCanvas.version).toBe(4);
    expect(beachBoardwalkCanvas.limits).toEqual({
      maxAvatars: 24,
      maxItems: 169,
      maxComplexPhysicsItems: 4,
    });
    expect(beachBoardwalkCanvas.staticGeometry).toEqual([
      expect.objectContaining({
        id: "lifeguard-hut",
        shape: { type: "rect", width: 38, height: 42 },
        position: { x: 79, y: 27 },
      }),
      expect.objectContaining({
        id: "umbrella-table",
        shape: { type: "circle", radius: 14 },
        position: { x: 18, y: 36 },
      }),
      expect.objectContaining({
        id: "boardwalk-bench",
        shape: { type: "rect", width: 31, height: 21 },
        position: { x: 16, y: 108 },
      }),
      expect.objectContaining({
        id: "snack-cart",
        shape: { type: "rect", width: 28, height: 49 },
        position: { x: 88, y: 116.5 },
      }),
      expect.objectContaining({
        id: "lower-pool-edge",
        shape: { type: "rect", width: 76, height: 16 },
        position: { x: 25, y: 141 },
      }),
    ]);
  });

  it("keeps the physics avatar visual transparent beneath the roster avatar", () => {
    expect(loungeAvatarDefinition.visual.spriteId).toBe(
      "lounge.stamp.transparent",
    );
  });

  it("moves the beach ball when an avatar runs into it", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({
        fillRect: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray([0]) }),
      } as never);
    const { createSimulationBehaviorRegistry, HostSimulation, RapierWorld } =
      await import("@canvas-physics/client");
    getContext.mockRestore();
    await RapierWorld.load();
    const simulation = new HostSimulation(
      beachBoardwalkCanvas,
      beachBoardwalkDefinitions,
      createSimulationBehaviorRegistry(),
    );
    simulation.addItem({
      entityId: "test-beach-ball",
      canvasId: beachBoardwalkCanvas.id,
      definitionId: beachBallDefinition.definitionId,
      definitionVersion: beachBallDefinition.version,
      ownerUserId: "system",
      transform: { x: 62, y: 98, rotation: 0 },
      resolvedConfig: beachBallDefinition.defaultConfig,
      createdAt: "2026-08-26T00:00:00Z",
      sceneRevision: 1,
    });
    simulation.addAvatar({
      entityId: "test-avatar",
      clientId: "test-client",
      userId: "test-player",
      position: { x: 48, y: 98 },
      radius: beachBoardwalkCanvas.avatarController?.radius,
      maxSpeed: beachBoardwalkCanvas.avatarController?.maxSpeed,
      acceleration: beachBoardwalkCanvas.avatarController?.acceleration,
      flickDeceleration:
        beachBoardwalkCanvas.avatarController?.flickDeceleration,
    });

    for (let step = 0; step < 30; step += 1) {
      simulation.world.setAvatarInput(
        "test-avatar",
        { x: 1, y: 0 },
        1,
        step + 1,
        true,
        { x: 56, y: 98 },
      );
      simulation.step();
    }
    simulation.world.setAvatarInput(
      "test-avatar",
      { x: 0, y: 0 },
      0,
      31,
      false,
    );
    for (let step = 0; step < 30; step += 1) simulation.step();

    expect(simulation.world.transform("test-beach-ball")?.x).toBeGreaterThan(
      64,
    );
    simulation.free();
  }, 15_000);
});
