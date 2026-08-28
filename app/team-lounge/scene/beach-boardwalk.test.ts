import { CollisionLayer } from "@canvas-physics/core";
import { describe, expect, it } from "vitest";

import { loungeItemDefinitions } from "../lounge-items";
import { beachBallDefinition, beachBoardwalkCanvas } from "./beach-boardwalk";

describe("Beach Boardwalk collision contract", () => {
  it("keeps only the outer boundary solid", () => {
    expect(beachBoardwalkCanvas.version).toBe(9);
    expect(beachBallDefinition.version).toBe(5);
    expect(beachBoardwalkCanvas.staticGeometry).toEqual([]);
    expect(beachBoardwalkCanvas.edges).toEqual({
      top: "solid",
      right: "solid",
      bottom: "solid",
      left: "solid",
    });
    expect(beachBallDefinition.colliders?.[0]).toMatchObject({
      id: "solid",
      collisionMask: CollisionLayer.WORLD_STATIC,
    });
    expect(
      loungeItemDefinitions.find(
        ({ definitionId }) => definitionId === "zoomigo-prop-beach-ball",
      )?.colliders?.[0],
    ).toMatchObject({ collisionMask: CollisionLayer.WORLD_STATIC });
  });
});
