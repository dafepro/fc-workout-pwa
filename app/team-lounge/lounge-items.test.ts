import { describe, expect, it } from "vitest";
import { CollisionLayer } from "@canvas-physics/core";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  includedLoungeItems,
  LoungeVisualLayer,
  loungeItemChoices,
  loungeItemDefinitions,
  loungeItemForDefinition,
} from "./lounge-items";
import { beachBoardwalkAssets } from "./scene/assets";

describe("development Lounge items", () => {
  const compositeItemIDs = [
    "ball-cannon",
    "boost-pad",
    "bounce-drum",
    "pinwheel",
    "orbit-beacon",
    "breeze-fan",
    "soft-sand-mat",
    "speed-lane",
    "wobble-cone",
    "swing-gate",
    "mini-goal",
  ];

  it("keeps the included ball cannon above the scroll fold", () => {
    expect(
      includedLoungeItems.find(({ kind }) => kind === "lounge_prop"),
    ).toMatchObject({
      id: "ball-cannon",
      source: "included",
    });
  });

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
      includedLoungeItems.filter(({ definitionId }) =>
        definitionId.startsWith("zoomigo-prop-starlight-"),
      ),
    ).toMatchObject([
      {
        id: "camp-lantern",
        kind: "lounge_stamp",
        imageSrc: "/team-lounge/items/camp-lantern-v1.png",
      },
      {
        id: "pennant-flag",
        kind: "lounge_stamp",
        imageSrc: "/team-lounge/items/pennant-flag-v1.png",
      },
      {
        id: "water-cooler",
        kind: "lounge_stamp",
        imageSrc: "/team-lounge/items/water-cooler-v1.png",
      },
      {
        id: "training-cone",
        kind: "lounge_stamp",
        imageSrc: "/team-lounge/items/training-cone-v1.png",
      },
    ]);
  });

  it("gives every placeable item a durable transparent definition", () => {
    expect(loungeItemDefinitions).toHaveLength(26);
    expect(
      new Set(loungeItemDefinitions.map(({ definitionId }) => definitionId))
        .size,
    ).toBe(26);
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
    expect(beachBoardwalkAssets.textures).toContainEqual({
      id: "lounge.stamp.transparent",
      sourceId: "lounge-transparent-source",
    });
  });

  it("ships eleven unique included props with two or more compatible effects", () => {
    const props = includedLoungeItems.filter(({ id }) =>
      compositeItemIDs.includes(id),
    );

    expect(props.map(({ id }) => id)).toEqual(compositeItemIDs);
    expect(new Set(props.map(({ definitionId }) => definitionId)).size).toBe(
      11,
    );
    expect(props.every(({ kind }) => kind === "lounge_prop")).toBe(true);
    expect(props.every(({ imageSrc }) => imageSrc?.includes("-v1."))).toBe(
      true,
    );

    const combinations = props.map((prop) => {
      const definition = loungeItemDefinitions.find(
        ({ definitionId }) => definitionId === prop.definitionId,
      );
      expect(definition).toMatchObject({
        behaviorType: "zoomigoLoungeComposite",
      });
      const effects = (definition?.defaultConfig as { effects?: unknown[] })
        ?.effects;
      expect(effects?.length).toBeGreaterThanOrEqual(2);
      expect(definition?.colliders.length).toBeGreaterThan(0);
      return JSON.stringify(effects);
    });
    expect(new Set(combinations).size).toBe(11);

    const goal = loungeItemDefinitions.find(
      ({ definitionId }) => definitionId === "zoomigo-prop-play-mini-goal",
    );
    expect(goal).toMatchObject({
      version: 5,
      colliders: expect.arrayContaining([
        expect.objectContaining({
          id: "mouth",
          shape: { type: "rect", width: 11, height: 2 },
          offset: { x: 0, y: -2.5 },
        }),
      ]),
      defaultConfig: {
        effects: expect.arrayContaining([
          expect.objectContaining({
            kind: "goal",
            holdSeconds: 0.4,
            ejectOffset: { x: 0, y: 8 },
            ejectSpeed: 18,
          }),
        ]),
      },
    });

    const cannon = loungeItemDefinitions.find(
      ({ definitionId }) => definitionId === "zoomigo-prop-play-ball-cannon",
    );
    expect(cannon).toMatchObject({
      version: 1,
      defaultConfig: {
        effects: expect.arrayContaining([
          expect.objectContaining({
            kind: "cannon",
            acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
            exitOffset: { x: 10, y: 0 },
            speed: 34,
          }),
        ]),
      },
    });
  });

  it("binds every configured sensor effect to a real bounded collider", () => {
    const definitions = loungeItemDefinitions.filter(({ definitionId }) =>
      definitionId.startsWith("zoomigo-prop-play-"),
    );

    expect(definitions).toHaveLength(11);
    for (const definition of definitions) {
      const colliderIDs = new Set(definition.colliders.map(({ id }) => id));
      const config = definition.defaultConfig as {
        effects: { kind: string; sensorId?: string }[];
      };
      for (const effect of config.effects) {
        if (effect.sensorId)
          expect(colliderIDs.has(effect.sensorId)).toBe(true);
      }

      for (const collider of definition.colliders) {
        if (collider.role === "itemSolid") {
          const offset = collider.offset ?? { x: 0, y: 0 };
          const halfWidth =
            collider.shape.type === "circle"
              ? collider.shape.radius
              : collider.shape.type === "rect"
                ? collider.shape.width / 2
                : 0;
          const halfHeight =
            collider.shape.type === "circle"
              ? collider.shape.radius
              : collider.shape.type === "rect"
                ? collider.shape.height / 2
                : 0;
          expect(Math.abs(offset.x) + halfWidth).toBeLessThanOrEqual(
            definition.visual.size.width / 2,
          );
          expect(Math.abs(offset.y) + halfHeight).toBeLessThanOrEqual(
            definition.visual.size.height / 2,
          );
        } else {
          const diameter =
            collider.shape.type === "circle"
              ? collider.shape.radius * 2
              : collider.shape.type === "rect"
                ? Math.max(collider.shape.width, collider.shape.height)
                : 0;
          expect(diameter).toBeGreaterThan(0);
          expect(diameter).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it("keeps avatars non-blocking while ball solids still meet physical props", () => {
    const solids = loungeItemDefinitions.flatMap((definition) =>
      definition.colliders.filter(({ role }) => role === "itemSolid"),
    );

    expect(solids.length).toBeGreaterThan(0);
    for (const solid of solids) {
      expect((solid.collisionMask ?? 0) & CollisionLayer.AVATAR_BODY).toBe(0);
      expect((solid.collisionMask ?? 0) & CollisionLayer.ITEM_SOLID).toBe(
        CollisionLayer.ITEM_SOLID,
      );
    }
  });

  it("uses semantic draw bands so moving balls stay above props and below avatars", () => {
    const compositeDefinitions = loungeItemDefinitions.filter(
      ({ definitionId }) => definitionId.startsWith("zoomigo-prop-play-"),
    );
    const groundIDs = new Set([
      "zoomigo-prop-play-boost-pad",
      "zoomigo-prop-play-soft-sand-mat",
      "zoomigo-prop-play-speed-lane",
    ]);

    expect(LoungeVisualLayer).toEqual({
      DECAL: 4,
      GROUND_EFFECT: 6,
      PROP: 10,
      BALL: 20,
      AVATAR: 30,
    });
    for (const definition of compositeDefinitions) {
      expect(definition.visual.zIndex).toBe(
        groundIDs.has(definition.definitionId)
          ? LoungeVisualLayer.GROUND_EFFECT
          : LoungeVisualLayer.PROP,
      );
    }
    expect(
      loungeItemDefinitions.find(
        ({ definitionId }) => definitionId === "zoomigo-prop-beach-ball",
      )?.visual.zIndex,
    ).toBe(LoungeVisualLayer.BALL);
  });

  it("stores every generated PNG sprite as bounded RGBA art", () => {
    for (const item of includedLoungeItems.filter(
      ({ definitionId, imageSrc }) =>
        definitionId.startsWith("zoomigo-prop-play-") &&
        imageSrc?.endsWith(".png"),
    )) {
      const bytes = readFileSync(
        join(process.cwd(), "public", item.imageSrc!.replace(/^\//, "")),
      );
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      expect(Math.max(width, height)).toBeLessThanOrEqual(384);
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(96);
      expect(bytes[25]).toBe(6);
    }
  });

  it("ships the cannon as bounded vector art with no embedded external resources", () => {
    const cannon = includedLoungeItems.find(({ id }) => id === "ball-cannon");
    expect(cannon?.imageSrc).toBe("/team-lounge/items/ball-cannon-v1.svg");
    const art = readFileSync(
      join(process.cwd(), "public", cannon!.imageSrc!.replace(/^\//, "")),
      "utf8",
    );
    expect(art).toContain('viewBox="0 0 192 112"');
    expect(art).not.toMatch(/<script|(?:href|src)=["'](?:https?:|data:)/iu);
  });

  it("keeps stamps decorative and requires every item to declare engine capabilities", () => {
    for (const definition of loungeItemDefinitions) {
      const choice = loungeItemForDefinition(definition.definitionId);
      expect(choice).toBeDefined();
      if (choice?.kind === "lounge_stamp") {
        expect(choice.capabilities).toEqual([]);
        expect(definition.body).toBeUndefined();
        expect(definition.colliders).toEqual([]);
        expect(definition.behaviorType).toBeUndefined();
      } else {
        expect(choice?.capabilities.length).toBeGreaterThan(0);
        expect(
          Boolean(
            definition.body ||
              definition.colliders.length ||
              definition.behaviorType,
          ),
        ).toBe(true);
      }
    }
  });
});
