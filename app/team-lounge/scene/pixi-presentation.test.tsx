import { describe, expect, it } from "vitest";

import { defaultAvatar } from "../../avatar/config";
import type { Player } from "../../domain/types";
import { loungeItemDefinitions } from "../lounge-items";
import { beachBoardwalkAssets } from "./assets";
import { beachBoardwalkDefinitions } from "./beach-boardwalk";
import { createLoungePixiPresentation } from "./pixi-presentation";

const players: Player[] = [
  player("player-mason", "Mason", "C."),
  player("player-ava", "Ava", "R."),
];

describe("Lounge Pixi presentation", () => {
  it("gives Pixi participant-specific avatar textures without changing authority", () => {
    const presentation = createLoungePixiPresentation({
      assets: beachBoardwalkAssets,
      definitions: [...beachBoardwalkDefinitions, ...loungeItemDefinitions],
      roster: players,
      currentPlayerID: "player-mason",
      avatarConfig: defaultAvatar(),
    });
    const avatar = presentation.definitions.find(
      ({ definitionId }) => definitionId === "avatar",
    );
    const variants = avatar?.visual.variants ?? {};

    expect(Object.keys(variants)).toEqual(["participant-0", "participant-1"]);
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
    ).toEqual({ variant: "participant-1" });

    const currentSource = presentation.assets.sources.find(
      ({ id }) => id === "lounge-avatar-source-0",
    );
    const teammateSource = presentation.assets.sources.find(
      ({ id }) => id === "lounge-avatar-source-1",
    );
    expect(decodeSVG(currentSource?.src)).toContain("avatar-art__layer");
    expect(decodeSVG(teammateSource?.src)).toContain(">AR<");
  });

  it("gives every placed item a real Pixi texture while preserving its definition", () => {
    const presentation = createLoungePixiPresentation({
      assets: beachBoardwalkAssets,
      definitions: [...beachBoardwalkDefinitions, ...loungeItemDefinitions],
      roster: players,
      currentPlayerID: "player-mason",
      avatarConfig: defaultAvatar(),
    });

    for (const original of loungeItemDefinitions) {
      const presented = presentation.definitions.find(
        ({ definitionId }) => definitionId === original.definitionId,
      );
      expect(presented?.visual.spriteId).toBe(
        `lounge.item.${original.definitionId}`,
      );
      expect(presented?.body).toEqual(original.body);
      expect(presented?.colliders).toEqual(original.colliders);
      expect(presented?.behaviorType).toBe(original.behaviorType);
      expect(presentation.assets.textures).toContainEqual({
        id: `lounge.item.${original.definitionId}`,
        sourceId: `lounge-item-source-${original.definitionId}`,
      });
    }
  });
});

function decodeSVG(source: string | undefined): string {
  expect(source).toMatch(/^data:image\/svg\+xml,/u);
  return decodeURIComponent(source!.slice(source!.indexOf(",") + 1));
}

function player(id: string, firstName: string, lastInitial: string): Player {
  return {
    id,
    firstName,
    lastInitial,
    initials: `${firstName[0]}${lastInitial[0]}`,
    avatarColor: "#6e56cf",
    weeklySessions: 1,
    effortPoints: 4,
    currentStreak: 1,
    consistency: 1,
  };
}
