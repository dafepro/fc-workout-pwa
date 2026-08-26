import { describe, expect, it } from "vitest";
import {
  validateCanvasDefinition,
  validateItemDefinition,
} from "@canvas-physics/core";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
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

  it("keeps the room within the initial mobile scene budget", () => {
    expect(beachBoardwalkCanvas.limits).toEqual({
      maxAvatars: 24,
      maxItems: 48,
      maxComplexPhysicsItems: 4,
    });
    expect(beachBoardwalkCanvas.staticGeometry).toHaveLength(5);
  });
});
