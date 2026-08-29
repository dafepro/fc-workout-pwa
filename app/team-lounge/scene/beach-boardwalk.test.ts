import { CollisionLayer } from "@canvas-physics/core";
import { describe, expect, it } from "vitest";

import { loungeItemDefinitions } from "../lounge-items";
import { beachBallDefinition, beachBoardwalkCanvas } from "./beach-boardwalk";

describe("Beach Boardwalk collision contract", () => {
  it("uses explicit elastic outer boundaries", () => {
    expect(beachBoardwalkCanvas.version).toBe(13);
    expect(beachBallDefinition.version).toBe(6);
    expect(beachBoardwalkCanvas.edges).toEqual({
      top: "open",
      right: "open",
      bottom: "open",
      left: "open",
    });
    expect(beachBoardwalkCanvas.staticGeometry).toHaveLength(4);
    for (const boundary of beachBoardwalkCanvas.staticGeometry) {
      expect(boundary).toMatchObject({
        restitution: 1,
        friction: 0,
        tags: ["elastic-edge"],
        blocks: { avatars: true, items: true },
      });
    }
    expect(beachBallDefinition.colliders?.[0]).toMatchObject({
      id: "solid",
      collisionMask: CollisionLayer.WORLD_STATIC,
      restitution: 0.95,
      friction: 0.05,
    });
    expect(beachBallDefinition.body?.linearDamping).toBe(0.05);
    expect(beachBoardwalkCanvas.environment.base.linearDrag).toBe(0.03);
    expect(
      loungeItemDefinitions.find(
        ({ definitionId }) => definitionId === "zoomigo-prop-beach-ball",
      )?.colliders?.[0],
    ).toMatchObject({ collisionMask: CollisionLayer.WORLD_STATIC });
  });
});
