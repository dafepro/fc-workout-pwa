import { describe, expect, it } from "vitest";

import {
  loungeItemDefinitions,
  loungeItemForDefinition,
} from "../lounge-items";
import { beachBoardwalkAssets } from "./assets";
import { beachBoardwalkDefinitions } from "./beach-boardwalk";
import { createLoungePixiPresentation } from "./pixi-presentation";

describe("Lounge Pixi presentation", () => {
  it("keeps Pixi avatars transparent so the DOM owns each complete avatar stack", () => {
    const presentation = createLoungePixiPresentation({
      assets: beachBoardwalkAssets,
      definitions: [...beachBoardwalkDefinitions, ...loungeItemDefinitions],
    });
    const avatar = presentation.definitions.find(
      ({ definitionId }) => definitionId === "avatar",
    );
    expect(avatar?.visual.spriteId).toBe("lounge.avatar");
    expect(avatar?.visual.variants).toBeUndefined();
    expect(
      presentation.projectEntityVisual({
        id: "avatar:player-ava",
        kind: "avatar",
        definitionId: "avatar",
        x: 0,
        y: 0,
        rotation: 0,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        userId: "player-ava",
      }),
    ).toBeUndefined();
    expect(
      presentation.assets.sources.some(({ id }) =>
        id.startsWith("lounge-avatar-source-"),
      ),
    ).toBe(false);
  });

  it("leaves stamps transparent for the shared DOM art while Pixi paints props", () => {
    const presentation = createLoungePixiPresentation({
      assets: beachBoardwalkAssets,
      definitions: [...beachBoardwalkDefinitions, ...loungeItemDefinitions],
    });

    for (const original of loungeItemDefinitions) {
      const presented = presentation.definitions.find(
        ({ definitionId }) => definitionId === original.definitionId,
      );
      const isStamp =
        loungeItemForDefinition(original.definitionId)?.kind === "lounge_stamp";
      expect(presented?.visual.spriteId).toBe(
        isStamp
          ? "lounge.stamp.transparent"
          : `lounge.item.${original.definitionId}`,
      );
      expect(presented?.body).toEqual(original.body);
      expect(presented?.colliders).toEqual(original.colliders);
      expect(presented?.behaviorType).toBe(original.behaviorType);
      if (isStamp) {
        expect(presentation.assets.textures).not.toContainEqual({
          id: `lounge.item.${original.definitionId}`,
          sourceId: `lounge-item-source-${original.definitionId}`,
        });
      } else {
        expect(presentation.assets.textures).toContainEqual({
          id: `lounge.item.${original.definitionId}`,
          sourceId: `lounge-item-source-${original.definitionId}`,
        });
      }
    }
  });
});
