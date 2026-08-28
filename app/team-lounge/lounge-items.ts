import { CollisionLayer, type ItemDefinition } from "@canvas-physics/core";

import type { PrizeUnlock } from "../data/prize-box-gateway";
import { defaultLoungeBallConfig } from "./lounge-ball-behavior";

export interface LoungeItemChoice {
  id: string;
  label: string;
  glyph: string;
  definitionId: string;
  source: "included" | "earned";
  kind: "lounge_stamp" | "lounge_prop";
}

const itemCatalog = [
  ["bolt", "Bolt", "⚡"],
  ["fire", "Fire", "🔥"],
  ["star", "Star", "🌟"],
  ["soccer", "Soccer ball", "⚽"],
  ["shield", "Shield", "🛡️"],
  ["target", "Target", "🎯"],
  ["rainbow", "Rainbow", "🌈"],
  ["lion", "Lion", "🦁"],
  ["rocket", "Rocket", "🚀"],
  ["sparkles", "Sparkles", "✨"],
] as const;

const stampChoice = (
  [id, label, glyph]: (typeof itemCatalog)[number],
  source: LoungeItemChoice["source"],
): LoungeItemChoice => ({
  id,
  label,
  glyph,
  definitionId: `zoomigo-stamp-${id}`,
  source,
  kind: "lounge_stamp",
});

const beachBallProp: LoungeItemChoice = {
  id: "beach-ball",
  label: "Beach ball",
  glyph: "⚽",
  definitionId: "zoomigo-prop-beach-ball",
  source: "earned",
  kind: "lounge_prop",
};

export const includedLoungeItems = itemCatalog
  .slice(0, 4)
  .map((item) => stampChoice(item, "included"));

export const loungeItemDefinitions: ItemDefinition[] = itemCatalog.map(
  (item) => ({
    definitionId: `zoomigo-stamp-${item[0]}`,
    version: 1,
    displayName: `${item[1]} stamp`,
    visual: {
      size: { width: 10, height: 10 },
      spriteId: "lounge.stamp.transparent",
      placeholder: { shape: "circle", color: 0xc9f31d },
      zIndex: 9,
    },
    colliders: [],
    defaultConfig: {},
    persistence: {
      transform: true,
      behaviorState: false,
      onRoomSleep: "pause",
    },
    complexity: "simple",
  }),
);
loungeItemDefinitions.push({
  definitionId: beachBallProp.definitionId,
  version: 2,
  displayName: "Beach ball prop",
  visual: {
    size: { width: 9, height: 9 },
    spriteId: "lounge.stamp.transparent",
    placeholder: { shape: "circle", color: 0xffd33d },
    zIndex: 8,
  },
  body: {
    mode: "dynamic",
    mass: 0.5,
    gravityScale: 0,
    linearDamping: 0.12,
    angularDamping: 0.12,
    canSleep: true,
  },
  colliders: [
    {
      id: "solid",
      role: "itemSolid",
      shape: { type: "circle", radius: 4.5 },
      restitution: 0.82,
      friction: 0.18,
      collisionMask: CollisionLayer.WORLD_STATIC,
    },
    { id: "kick", role: "itemSensor", shape: { type: "circle", radius: 5.8 } },
  ],
  behaviorType: "zoomigoLoungeBall",
  defaultConfig: defaultLoungeBallConfig,
  persistence: { transform: true, behaviorState: true, onRoomSleep: "pause" },
  complexity: "simple",
});

export function loungeItemChoices(
  inventory: readonly PrizeUnlock[],
): LoungeItemChoice[] {
  const earned = new Set(
    inventory
      .filter(({ item }) => item.kind === "lounge_stamp")
      .map(({ item }) => item.assetId),
  );
  return itemCatalog
    .flatMap((item, index) =>
      index < 4 || earned.has(item[0])
        ? [stampChoice(item, index < 4 ? "included" : "earned")]
        : [],
    )
    .concat(
      inventory.some(
        ({ item }) =>
          item.kind === "lounge_prop" && item.assetId === beachBallProp.id,
      )
        ? [beachBallProp]
        : [],
    );
}

export function loungeItemForDefinition(definitionId: string) {
  const item = itemCatalog.find(
    ([id]) => definitionId === `zoomigo-stamp-${id}`,
  );
  if (definitionId === beachBallProp.definitionId) return beachBallProp;
  return item ? stampChoice(item, "included") : undefined;
}
