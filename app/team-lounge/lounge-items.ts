import {
  CollisionLayer,
  type ColliderDefinition,
  type ItemDefinition,
  type RigidBodyDefinition,
} from "@canvas-physics/core";

import type { PrizeUnlock } from "../data/prize-box-gateway";
import { defaultLoungeBallConfig } from "./lounge-ball-behavior";
import type {
  LoungeCompositeConfig,
  LoungeCompositeEffect,
} from "./lounge-composite-behavior";

interface LoungeItemChoiceBase {
  id: string;
  label: string;
  glyph: string;
  imageSrc?: string;
  definitionId: string;
  definitionVersion: number;
  source: "included" | "earned";
}

export type LoungeItemCapability = "collision" | "physics" | "behavior";

export interface LoungeStampChoice extends LoungeItemChoiceBase {
  kind: "lounge_stamp";
  capabilities: readonly [];
}

export interface LoungePropChoice extends LoungeItemChoiceBase {
  kind: "lounge_prop";
  capabilities: readonly [LoungeItemCapability, ...LoungeItemCapability[]];
}

export type LoungeItemChoice = LoungeStampChoice | LoungePropChoice;

const LoungeCompositeBehaviorType = "zoomigoLoungeComposite";

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
): LoungeStampChoice => ({
  id,
  label,
  glyph,
  definitionId: `zoomigo-stamp-${id}`,
  definitionVersion: 2,
  source,
  kind: "lounge_stamp",
  capabilities: [],
});

const beachBallProp: LoungePropChoice = {
  id: "beach-ball",
  label: "Beach ball",
  glyph: "⚽",
  definitionId: "zoomigo-prop-beach-ball",
  definitionVersion: 3,
  source: "earned",
  kind: "lounge_prop",
  capabilities: ["collision", "physics", "behavior"],
};

const starlightStamps: LoungeStampChoice[] = [
  ["camp-lantern", "Camp lantern", "🏮"],
  ["pennant-flag", "Pennant flag", "🚩"],
  ["water-cooler", "Water cooler", "🧊"],
  ["training-cone", "Training cone", "🔶"],
].map(([id, label, glyph]) => ({
  id,
  label,
  glyph,
  imageSrc: `/team-lounge/items/${id}-v1.png`,
  definitionId: `zoomigo-prop-starlight-${id}`,
  definitionVersion: 2,
  source: "included",
  kind: "lounge_stamp",
  capabilities: [],
}));

interface CompositeItemSpec {
  id: string;
  label: string;
  glyph: string;
  size: { width: number; height: number };
  capabilities: LoungePropChoice["capabilities"];
  body?: RigidBodyDefinition;
  colliders: ColliderDefinition[];
  effects: LoungeCompositeEffect[];
}

const compositeItemSpecs: CompositeItemSpec[] = [
  {
    id: "boost-pad",
    label: "Boost pad",
    glyph: "⏩",
    size: { width: 9, height: 14 },
    capabilities: ["collision", "behavior"],
    colliders: [sensorRect("zone", 7, 12)],
    effects: [
      {
        kind: "boost",
        sensorId: "zone",
        speed: 18,
        directionRadians: -Math.PI / 2,
      },
      { kind: "hop", sensorId: "zone", elevationSpeed: 5 },
    ],
  },
  {
    id: "bounce-drum",
    label: "Bounce drum",
    glyph: "🥁",
    size: { width: 12, height: 12 },
    capabilities: ["collision", "physics", "behavior"],
    body: dynamicBody(7, 0.7),
    colliders: [solidCircle("solid", 5), sensorCircle("bumper", 6)],
    effects: [
      { kind: "bounce", sensorId: "bumper", impulse: 15 },
      { kind: "wobble", sensorId: "bumper", torque: 4 },
    ],
  },
  {
    id: "pinwheel",
    label: "Pinwheel",
    glyph: "✤",
    size: { width: 11, height: 11 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [sensorCircle("air", 6.5)],
    effects: [
      { kind: "spin", angularVelocity: 2.8 },
      { kind: "push", sensorId: "air", force: 6 },
    ],
  },
  {
    id: "orbit-beacon",
    label: "Orbit beacon",
    glyph: "🪐",
    size: { width: 11, height: 11 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [sensorCircle("field", 10)],
    effects: [
      { kind: "spin", angularVelocity: 1.2 },
      {
        kind: "orbit",
        sensorId: "field",
        radialForce: 5,
        tangentialForce: 8,
        maxForce: 9.5,
      },
    ],
  },
  {
    id: "breeze-fan",
    label: "Breeze fan",
    glyph: "🌬️",
    size: { width: 12, height: 11 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [
      {
        ...sensorRect("air", 15, 7),
        offset: { x: 7.5, y: 0 },
      },
    ],
    effects: [
      { kind: "spin", angularVelocity: 4.2 },
      { kind: "push", sensorId: "air", force: 13 },
    ],
  },
  {
    id: "soft-sand-mat",
    label: "Soft sand mat",
    glyph: "🏖️",
    size: { width: 16, height: 10 },
    capabilities: ["collision", "behavior"],
    colliders: [sensorRect("surface", 14, 8)],
    effects: [
      {
        kind: "dampen",
        sensorId: "surface",
        linearFactor: 0.88,
        angularFactor: 0.8,
        minimumSpeed: 0.75,
      },
      {
        kind: "orbit",
        sensorId: "surface",
        radialForce: 2,
        tangentialForce: 0,
        maxForce: 2,
      },
    ],
  },
  {
    id: "speed-lane",
    label: "Speed lane",
    glyph: "💨",
    size: { width: 18, height: 6 },
    capabilities: ["collision", "behavior"],
    colliders: [sensorRect("lane", 17, 5)],
    effects: [
      { kind: "boost", sensorId: "lane", speed: 22 },
      { kind: "push", sensorId: "lane", force: 5 },
    ],
  },
  {
    id: "wobble-cone",
    label: "Wobble cone",
    glyph: "🔺",
    size: { width: 9, height: 11 },
    capabilities: ["collision", "physics", "behavior"],
    body: dynamicBody(4, 0.4),
    colliders: [solidCircle("solid", 3.8), sensorCircle("bumper", 5)],
    effects: [
      { kind: "bounce", sensorId: "bumper", impulse: 7 },
      { kind: "wobble", sensorId: "bumper", torque: 9 },
    ],
  },
  {
    id: "swing-gate",
    label: "Swing gate",
    glyph: "↔️",
    size: { width: 18, height: 9 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [solidRect("bar", 14, 2.5), sensorRect("bumper", 15, 4)],
    effects: [
      { kind: "swing", amplitudeRadians: 0.7, periodSeconds: 3 },
      { kind: "bounce", sensorId: "bumper", impulse: 6 },
    ],
  },
  {
    id: "mini-goal",
    label: "Mini goal",
    glyph: "🥅",
    size: { width: 18, height: 11 },
    capabilities: ["collision", "behavior"],
    colliders: [
      { ...solidRect("left-post", 2, 10), offset: { x: -7.5, y: 0 } },
      { ...solidRect("right-post", 2, 10), offset: { x: 7.5, y: 0 } },
      { ...solidRect("back-bar", 15, 2), offset: { x: 0, y: -4.5 } },
      sensorRect("mouth", 13, 7),
    ],
    effects: [
      {
        kind: "dampen",
        sensorId: "mouth",
        linearFactor: 0.7,
        angularFactor: 0.7,
        minimumSpeed: 0.5,
      },
      {
        kind: "goal",
        sensorId: "mouth",
        requiredTag: "lounge-ball",
        resetPosition: { x: 62, y: 98 },
        dwellSeconds: 0.05,
        cooldownSeconds: 1,
      },
    ],
  },
];

export const compositeLoungeItems: LoungePropChoice[] = compositeItemSpecs.map(
  ({ id, label, glyph, capabilities }) => ({
    id,
    label,
    glyph,
    imageSrc: `/team-lounge/items/${id}-v1.png`,
    definitionId: `zoomigo-prop-play-${id}`,
    definitionVersion: 1,
    source: "included",
    kind: "lounge_prop",
    capabilities,
  }),
);

export const includedLoungeItems: LoungeItemChoice[] = [
  ...itemCatalog.slice(0, 4).map((item) => stampChoice(item, "included")),
  ...starlightStamps,
  ...compositeLoungeItems,
];

export const loungeItemDefinitions: ItemDefinition[] = itemCatalog.map(
  (item) => ({
    definitionId: `zoomigo-stamp-${item[0]}`,
    version: 2,
    displayName: `${item[1]} stamp`,
    visual: {
      size: { width: 10, height: 10 },
      spriteId: "lounge.stamp.transparent",
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
  version: 3,
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
    linearDamping: 0.05,
    angularDamping: 0.08,
    canSleep: true,
  },
  colliders: [
    {
      id: "solid",
      role: "itemSolid",
      shape: { type: "circle", radius: 4.5 },
      restitution: 0.95,
      friction: 0.05,
      collisionMask: CollisionLayer.WORLD_STATIC,
      tags: ["lounge-ball"],
    },
    { id: "kick", role: "itemSensor", shape: { type: "circle", radius: 5.8 } },
  ],
  behaviorType: "zoomigoLoungeBall",
  defaultConfig: defaultLoungeBallConfig,
  persistence: { transform: true, behaviorState: true, onRoomSleep: "pause" },
  complexity: "simple",
});
for (const spec of compositeItemSpecs) {
  const config: LoungeCompositeConfig = { effects: spec.effects };
  loungeItemDefinitions.push({
    definitionId: `zoomigo-prop-play-${spec.id}`,
    version: 1,
    displayName: spec.label,
    visual: {
      size: spec.size,
      spriteId: "lounge.stamp.transparent",
      zIndex: 10,
    },
    body: spec.body ?? { mode: "fixed" },
    colliders: spec.colliders,
    behaviorType: LoungeCompositeBehaviorType,
    defaultConfig: config,
    persistence: {
      transform: true,
      behaviorState: true,
      onRoomSleep: "pause",
    },
    complexity: "simple",
  });
}
for (const item of starlightStamps) {
  loungeItemDefinitions.push({
    definitionId: item.definitionId,
    version: item.definitionVersion,
    displayName: item.label,
    visual: {
      size: { width: 10, height: 10 },
      spriteId: "lounge.stamp.transparent",
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
  });
}

export function loungeItemChoices(
  inventory: readonly PrizeUnlock[],
): LoungeItemChoice[] {
  const earned = new Set(
    inventory
      .filter(({ item }) => item.kind === "lounge_stamp")
      .map(({ item }) => item.assetId),
  );
  return [
    ...includedLoungeItems,
    ...itemCatalog
      .slice(4)
      .flatMap((item) =>
        earned.has(item[0]) ? [stampChoice(item, "earned")] : [],
      ),
    ...(inventory.some(
      ({ item }) =>
        item.kind === "lounge_prop" && item.assetId === beachBallProp.id,
    )
      ? [beachBallProp]
      : []),
  ];
}

export function loungeItemForDefinition(definitionId: string) {
  const item = itemCatalog.find(
    ([id]) => definitionId === `zoomigo-stamp-${id}`,
  );
  if (definitionId === beachBallProp.definitionId) return beachBallProp;
  const prop = starlightStamps.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (prop) return prop;
  const composite = compositeLoungeItems.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (composite) return composite;
  return item ? stampChoice(item, "included") : undefined;
}

function sensorRect(id: string, width: number, height: number) {
  return {
    id,
    role: "itemSensor" as const,
    shape: { type: "rect" as const, width, height },
  };
}

function sensorCircle(id: string, radius: number) {
  return {
    id,
    role: "itemSensor" as const,
    shape: { type: "circle" as const, radius },
  };
}

function solidRect(id: string, width: number, height: number) {
  return {
    id,
    role: "itemSolid" as const,
    shape: { type: "rect" as const, width, height },
    collisionMask:
      CollisionLayer.AVATAR_BODY |
      CollisionLayer.WORLD_STATIC |
      CollisionLayer.ITEM_SOLID,
    restitution: 0.75,
    friction: 0.15,
  };
}

function solidCircle(id: string, radius: number) {
  return {
    id,
    role: "itemSolid" as const,
    shape: { type: "circle" as const, radius },
    collisionMask:
      CollisionLayer.AVATAR_BODY |
      CollisionLayer.WORLD_STATIC |
      CollisionLayer.ITEM_SOLID,
    restitution: 0.8,
    friction: 0.12,
  };
}

function dynamicBody(mass: number, angularDamping: number) {
  return {
    mode: "dynamic" as const,
    mass,
    gravityScale: 0,
    linearDamping: 0.4,
    angularDamping,
    canSleep: true,
  };
}

function kinematicBody() {
  return {
    mode: "kinematicVelocity" as const,
    gravityScale: 0,
    canSleep: false,
  };
}
