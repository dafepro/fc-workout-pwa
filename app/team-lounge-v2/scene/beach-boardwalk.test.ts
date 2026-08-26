import { describe, expect, it } from "vitest";
import {
  validateCanvasDefinition,
  validateItemDefinition,
} from "@canvas-physics/core";
import {
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
    ).toEqual(expect.objectContaining({ behaviorType: "kickable" }));
  });

  it("reserves one non-complex item slot per avatar-day plus the ball", () => {
    expect(beachBoardwalkCanvas.version).toBe(3);
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
});
