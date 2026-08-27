import { describe, expect, it, vi } from "vitest";
import {
  CollisionLayer,
  validateCanvasDefinition,
  validateItemDefinition,
} from "@canvas-physics/core";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
  loungeAvatarDefinition,
} from "./beach-boardwalk";
import { beachBoardwalkAssets } from "./assets";

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
        visual: expect.objectContaining({ spriteId: "lounge.ball" }),
        colliders: expect.arrayContaining([
          expect.objectContaining({
            id: "solid",
            collisionMask:
              CollisionLayer.WORLD_STATIC |
              CollisionLayer.ITEM_SOLID |
              CollisionLayer.ITEM_SENSOR |
              CollisionLayer.REGION_SENSOR,
          }),
        ]),
      }),
    );
    expect(
      beachBoardwalkAssets.textures.some(({ id }) => id === "lounge.ball"),
    ).toBe(true);
  });

  it("reserves one non-complex item slot per avatar-day plus the ball", () => {
    expect(beachBoardwalkCanvas.version).toBe(5);
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

  it("moves the beach ball when avatar-drag crosses it", async () => {
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
    const ball = beachBoardwalkCanvas.systemItems[0];
    simulation.addItem({
      ...ball,
      canvasId: beachBoardwalkCanvas.id,
      ownerUserId: "system",
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

    let kicked = false;
    let kickedSpeed = 0;
    for (let step = 0; step < 120; step += 1) {
      simulation.world.setAvatarInput(
        "test-avatar",
        { x: 1, y: 0 },
        1,
        step + 1,
        true,
        { x: 80, y: 98 },
      );
      simulation.step();
      const state = simulation.behaviors.slot(ball.entityId)?.state as
        | { kickCount?: number }
        | undefined;
      kicked ||= (state?.kickCount ?? 0) > 0;
      if (kicked) {
        const velocity = simulation.world.registry.require(ball.entityId)
          .rigidBody?.velocity;
        kickedSpeed = Math.max(
          kickedSpeed,
          Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0),
        );
      }
    }

    expect(kicked).toBe(true);
    expect(kickedSpeed).toBeGreaterThan(10);
    expect(
      Math.abs((simulation.world.transform(ball.entityId)?.x ?? 62) - 62),
    ).toBeGreaterThan(5);
    simulation.free();
  }, 15_000);
});
