import { describe, expect, it } from "vitest";
import { statSync } from "node:fs";
import { join } from "node:path";

import {
  includedLoungeItems,
  loungeItemChoices,
  loungeItemDefinitions,
} from "./lounge-items";

describe("development Lounge items", () => {
  it("offers included stamps plus only earned Lounge inventory", () => {
    const choices = loungeItemChoices([
      {
        item: {
          id: "lounge-stamp-lion",
          kind: "lounge_stamp",
          slot: "stamp",
          assetId: "lion",
          label: "Lion stamp",
          catalogVersion: 1,
          rarity: "epic",
          destination: "team_lounge",
        },
        source: "daily_check_in",
        unlockedAt: "2026-08-28T00:00:00Z",
      },
      {
        item: {
          id: "lounge-prop-beach-ball",
          kind: "lounge_prop",
          slot: "prop",
          assetId: "beach-ball",
          label: "Beach ball",
          catalogVersion: 1,
          rarity: "uncommon",
          destination: "team_lounge",
        },
        source: "daily_check_in",
        unlockedAt: "2026-08-28T00:00:00Z",
      },
      {
        item: {
          id: "avatar-head-dog",
          kind: "avatar_part",
          slot: "head",
          assetId: "dog",
          label: "Dog",
          catalogVersion: 1,
          rarity: "common",
          destination: "avatar",
        },
        source: "daily_check_in",
        unlockedAt: "2026-08-28T00:00:00Z",
      },
    ]);

    expect(choices.map(({ id }) => id)).toEqual([
      ...includedLoungeItems.map(({ id }) => id),
      "lion",
      "beach-ball",
    ]);
    expect(
      includedLoungeItems.filter(({ kind }) => kind === "lounge_prop"),
    ).toMatchObject([
      {
        id: "camp-lantern",
        imageSrc: "/team-lounge/items/camp-lantern-v1.png",
      },
      {
        id: "pennant-flag",
        imageSrc: "/team-lounge/items/pennant-flag-v1.png",
      },
      {
        id: "water-cooler",
        imageSrc: "/team-lounge/items/water-cooler-v1.png",
      },
      {
        id: "training-cone",
        imageSrc: "/team-lounge/items/training-cone-v1.png",
      },
    ]);
  });

  it("gives every placeable item a durable transparent definition", () => {
    expect(loungeItemDefinitions).toHaveLength(15);
    expect(
      new Set(loungeItemDefinitions.map(({ definitionId }) => definitionId))
        .size,
    ).toBe(15);
    expect(
      loungeItemDefinitions.every(({ persistence }) => persistence?.transform),
    ).toBe(true);
    expect(
      loungeItemDefinitions.find(
        ({ definitionId }) => definitionId === "zoomigo-prop-beach-ball",
      ),
    ).toMatchObject({ behaviorType: "zoomigoLoungeBall" });
    expect(
      loungeItemDefinitions.filter(({ definitionId }) =>
        definitionId.startsWith("zoomigo-prop-starlight-"),
      ),
    ).toHaveLength(4);
    for (const item of includedLoungeItems.filter(({ imageSrc }) => imageSrc)) {
      const asset = statSync(
        join(process.cwd(), "public", item.imageSrc!.replace(/^\//, "")),
      );
      expect(asset.size).toBeLessThanOrEqual(256 * 1024);
    }
  });
});
