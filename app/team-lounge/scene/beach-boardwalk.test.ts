import { CollisionLayer } from "@canvas-physics/core";
import { describe, expect, it } from "vitest";

import { LoungeVisualLayer, loungeItemDefinitions } from "../lounge-items";
import {
  beachBallDefinition,
  beachBoardwalkCanvas,
  loungeAvatarDefinition,
} from "./beach-boardwalk";

describe("Beach Boardwalk collision contract", () => {
  it("uses explicit elastic outer boundaries", () => {
    expect(beachBoardwalkCanvas.version).toBe(18);
    expect(beachBallDefinition.version).toBe(9);
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
      collisionMask:
        CollisionLayer.WORLD_STATIC |
        CollisionLayer.ITEM_SOLID |
        CollisionLayer.ITEM_SENSOR,
      restitution: 0.95,
      friction: 0.05,
      tags: ["lounge-ball"],
    });
    expect(beachBallDefinition.body?.linearDamping).toBe(0.05);
    expect(beachBallDefinition.visual.zIndex).toBe(LoungeVisualLayer.BALL);
    expect(loungeAvatarDefinition.visual.zIndex).toBe(LoungeVisualLayer.AVATAR);
    expect(beachBoardwalkCanvas.environment.base.linearDrag).toBe(0.03);
    const catalogBall = loungeItemDefinitions.find(
      ({ definitionId }) => definitionId === "zoomigo-prop-beach-ball",
    );
    expect(catalogBall?.version).toBe(6);
    expect(catalogBall?.colliders).toContainEqual(
      expect.objectContaining({
        role: "itemSolid",
        collisionMask:
          CollisionLayer.WORLD_STATIC |
          CollisionLayer.ITEM_SOLID |
          CollisionLayer.ITEM_SENSOR,
      }),
    );
  });
});
