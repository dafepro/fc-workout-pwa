import {
  CollisionLayer,
  type ColliderDefinition,
  type ItemDefinition,
  type RigidBodyDefinition,
} from "@canvas-physics/core";

import type { PrizeItem, PrizeUnlock } from "../data/prize-box-gateway";
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
  defaultScale?: number;
  maxScale?: number;
  artOffset?: Readonly<{ xPercent: number; yPercent: number }>;
}

export type LoungeItemCapability = "collision" | "physics" | "behavior";

export const LoungeVisualLayer = {
  BENCH_AVATAR: 2,
  DECAL: 4,
  GROUND_EFFECT: 6,
  PROP: 10,
  BALL: 20,
  AVATAR: 30,
} as const;

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
  definitionVersion: 3,
  source,
  kind: "lounge_stamp",
  capabilities: [],
});

const beachBallProp: LoungePropChoice = {
  id: "beach-ball",
  label: "Beach ball",
  glyph: "⚽",
  imageSrc: "/team-lounge/beach-ball.svg",
  definitionId: "zoomigo-prop-beach-ball",
  definitionVersion: 6,
  source: "earned",
  kind: "lounge_prop",
  capabilities: ["collision", "physics", "behavior"],
};

const sillyStamps: LoungeStampChoice[] = [
  ["silly-goose", "Certified silly goose", "GOOSE"],
  ["zoomies", "Oops! All zoomies", "ZOOM"],
  ["running-on-pickles", "Running on pickles", "PICKLE"],
  ["just-goals", "No thoughts, just goals", "GOALS"],
  ["professional-cone", "Professional cone", "CONE"],
  ["snack-attack", "Snack attack", "SNACK"],
  ["tiny-mighty", "Tiny but mighty", "MIGHTY"],
  ["water-you-doing", "Water you doing?", "WATER"],
].map(([id, label, glyph]) => ({
  id,
  label,
  glyph,
  imageSrc: `/team-lounge/stamps/${id}-v1.svg`,
  definitionId: `zoomigo-stamp-silly-${id}`,
  definitionVersion: 1,
  source: "included",
  kind: "lounge_stamp",
  capabilities: [],
}));

const systemBeachBall: LoungePropChoice = {
  ...beachBallProp,
  id: "system-beach-ball",
  label: "Beach ball",
  imageSrc: "/team-lounge/beach-ball.svg",
  definitionId: "beach-ball",
  definitionVersion: 9,
  source: "included",
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
  definitionVersion: 3,
  source: "included",
  kind: "lounge_stamp",
  capabilities: [],
  ...(id === "water-cooler"
    ? { artOffset: { xPercent: -1.5, yPercent: 0 } }
    : undefined),
}));

interface CompositeItemSpec {
  id: string;
  source?: LoungePropChoice["source"];
  definitionVersion?: number;
  label: string;
  glyph: string;
  size: { width: number; height: number };
  imageSrc?: string;
  defaultScale?: number;
  maxScale?: number;
  artOffset?: Readonly<{ xPercent: number; yPercent: number }>;
  visualLayer?: number;
  capabilities: LoungePropChoice["capabilities"];
  body?: RigidBodyDefinition;
  colliders: ColliderDefinition[];
  effects: LoungeCompositeEffect[];
}

const compositeItemSpecs: CompositeItemSpec[] = [
  {
    id: "boost-pad",
    definitionVersion: 4,
    label: "Launch pad",
    glyph: "⏩",
    size: { width: 9, height: 14 },
    visualLayer: LoungeVisualLayer.GROUND_EFFECT,
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
      { kind: "wobble", sensorId: "bumper", torque: 420 },
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
    visualLayer: LoungeVisualLayer.GROUND_EFFECT,
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
    definitionVersion: 4,
    label: "Ball speed lane",
    glyph: "💨",
    size: { width: 18, height: 6 },
    maxScale: 2.1,
    visualLayer: LoungeVisualLayer.GROUND_EFFECT,
    capabilities: ["collision", "behavior"],
    colliders: [sensorRect("lane", 17, 5)],
    effects: [
      {
        kind: "dampen",
        sensorId: "lane",
        linearFactor: 1,
        angularFactor: 0.82,
        minimumSpeed: 0,
        acceptedDefinitionIds: [
          "lounge-ball",
          "beach-ball",
          "zoomigo-prop-beach-ball",
        ],
      },
      {
        kind: "accelerate",
        sensorId: "lane",
        impulsePerSecond: 90,
        acceptedDefinitionIds: [
          "lounge-ball",
          "beach-ball",
          "zoomigo-prop-beach-ball",
        ],
      },
    ],
  },
  {
    id: "wobble-cone",
    definitionVersion: 4,
    label: "Wobble cone",
    glyph: "🔺",
    size: { width: 9, height: 11 },
    capabilities: ["collision", "physics", "behavior"],
    body: dynamicBody(4, 0.4),
    colliders: [solidCircle("solid", 3.8), sensorCircle("bumper", 5)],
    effects: [
      {
        kind: "bounce",
        sensorId: "bumper",
        impulse: 7,
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
      },
      {
        kind: "wobble",
        sensorId: "bumper",
        torque: 780,
        nudgeImpulse: 0.9,
      },
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
    definitionVersion: 5,
    label: "Mini goal",
    glyph: "🥅",
    size: { width: 18, height: 11 },
    artOffset: { xPercent: -3, yPercent: 0 },
    capabilities: ["collision", "behavior"],
    colliders: [
      { ...solidRect("left-post", 2, 10), offset: { x: -7.5, y: 0 } },
      { ...solidRect("right-post", 2, 10), offset: { x: 7.5, y: 0 } },
      { ...solidRect("back-bar", 15, 2), offset: { x: 0, y: -4.5 } },
      { ...sensorRect("mouth", 11, 2), offset: { x: 0, y: -2.5 } },
    ],
    effects: [
      {
        kind: "dampen",
        sensorId: "mouth",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        linearFactor: 0.7,
        angularFactor: 0.7,
        minimumSpeed: 0.5,
      },
      {
        kind: "goal",
        sensorId: "mouth",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        holdSeconds: 0.4,
        ejectOffset: { x: 0, y: 8 },
        ejectSpeed: 18,
        cooldownSeconds: 1,
      },
    ],
  },
  {
    id: "ball-cannon",
    definitionVersion: 2,
    label: "Ball cannon",
    glyph: "💥",
    imageSrc: "/team-lounge/items/ball-cannon-v1.svg",
    size: { width: 18, height: 10.5 },
    capabilities: ["collision", "behavior"],
    colliders: [
      {
        ...sensorRect("intake", 4, 7),
        offset: { x: -7, y: 0 },
      },
      {
        ...solidRect("front-stop", 2, 8),
        offset: { x: 4, y: 0 },
      },
    ],
    effects: [
      {
        kind: "dampen",
        sensorId: "intake",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        linearFactor: 0,
        angularFactor: 0,
        minimumSpeed: 0,
      },
      {
        kind: "cannon",
        sensorId: "intake",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        exitOffset: { x: 10, y: 0 },
        speed: 50,
        dwellSeconds: 0.8,
        cooldownSeconds: 0.75,
      },
    ],
  },
  {
    id: "duck-pond",
    definitionVersion: 5,
    source: "earned",
    label: "Duck pond",
    glyph: "🦆",
    size: { width: 18, height: 14 },
    maxScale: 2.4,
    artOffset: { xPercent: 0, yPercent: 2.2 },
    visualLayer: LoungeVisualLayer.GROUND_EFFECT,
    capabilities: ["collision", "behavior"],
    colliders: [sensorCircle("shore", 10), sensorRect("water", 16, 12)],
    effects: [
      {
        kind: "flock",
        sensorId: "shore",
        radius: 13,
        lookAheadSeconds: 0.35,
        relaxSeconds: 1.2,
      },
      {
        kind: "dampen",
        sensorId: "water",
        linearFactor: 0.995,
        angularFactor: 0.98,
        minimumSpeed: 0,
      },
    ],
  },
  {
    id: "hammock",
    definitionVersion: 5,
    source: "earned",
    label: "Hammock",
    glyph: "🌴",
    imageSrc: "/team-lounge/items/hammock-sprite-v2.png",
    size: { width: 20, height: 12 },
    defaultScale: 1.4,
    maxScale: 2.4,
    artOffset: { xPercent: -0.4, yPercent: 4.5 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [sensorRect("bed", 18, 8)],
    effects: [
      {
        kind: "rest",
        sensorId: "bed",
        engageMaxSpeed: 6,
        settleSpeed: 3.2,
        animationSeconds: 0.75,
      },
    ],
  },
  {
    id: "robot-goalie",
    definitionVersion: 4,
    source: "earned",
    label: "Robot goalie",
    glyph: "🤖",
    size: { width: 18, height: 14 },
    capabilities: ["collision", "physics", "behavior"],
    body: kinematicBody(),
    colliders: [solidRect("keeper", 12, 3), sensorCircle("save-zone", 10)],
    effects: [
      {
        kind: "goalie",
        sensorId: "save-zone",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        travel: 8,
        maxSpeed: 18,
        trackingGain: 5,
        returnGain: 3,
      },
      {
        kind: "bounce",
        sensorId: "save-zone",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        impulse: 10,
      },
    ],
  },
  {
    id: "pinball-bumper",
    definitionVersion: 5,
    source: "earned",
    label: "Pinball bumper",
    glyph: "🔴",
    imageSrc: "/team-lounge/items/pinball-bumper-sprite-v2.png",
    size: { width: 11, height: 11 },
    capabilities: ["collision", "behavior"],
    colliders: [
      { ...solidCircle("solid", 4.5), restitution: 0.1, friction: 0.45 },
      sensorCircle("bumper", 5.5),
    ],
    effects: [
      {
        kind: "bounce",
        sensorId: "bumper",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        impulse: 56,
        directionRadians: -Math.PI / 2,
      },
      {
        kind: "hop",
        sensorId: "bumper",
        acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        elevationSpeed: 9,
      },
    ],
  },
];

export const compositeLoungeItems: LoungePropChoice[] = compositeItemSpecs.map(
  ({
    id,
    label,
    glyph,
    imageSrc,
    defaultScale,
    maxScale,
    artOffset,
    capabilities,
    definitionVersion = 3,
    source = "included",
  }) => ({
    id,
    label,
    glyph,
    imageSrc: imageSrc ?? `/team-lounge/items/${id}-v1.png`,
    definitionId: `zoomigo-prop-play-${id}`,
    definitionVersion,
    source,
    kind: "lounge_prop",
    capabilities,
    defaultScale,
    maxScale,
    artOffset,
  }),
);

const includedCompositeLoungeItems = compositeLoungeItems
  .filter(({ source }) => source === "included")
  .sort((left, right) => {
    if (left.id === "ball-cannon") return -1;
    if (right.id === "ball-cannon") return 1;
    return 0;
  });

export const includedLoungeItems: LoungeItemChoice[] = [
  ...itemCatalog.slice(0, 4).map((item) => stampChoice(item, "included")),
  ...sillyStamps,
  ...starlightStamps,
  ...includedCompositeLoungeItems,
];

export const loungeItemDefinitions: ItemDefinition[] = itemCatalog.map(
  (item) => ({
    definitionId: `zoomigo-stamp-${item[0]}`,
    version: 3,
    displayName: `${item[1]} stamp`,
    visual: {
      size: { width: 10, height: 10 },
      spriteId: "lounge.stamp.transparent",
      zIndex: LoungeVisualLayer.DECAL,
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
for (const item of sillyStamps) {
  loungeItemDefinitions.push({
    definitionId: item.definitionId,
    version: item.definitionVersion,
    displayName: item.label,
    visual: {
      size: { width: 18, height: 12 },
      spriteId: "lounge.stamp.transparent",
      zIndex: LoungeVisualLayer.DECAL,
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
loungeItemDefinitions.push({
  definitionId: beachBallProp.definitionId,
  version: 6,
  displayName: "Beach ball prop",
  visual: {
    size: { width: 9, height: 9 },
    spriteId: "lounge.stamp.transparent",
    placeholder: { shape: "circle", color: 0xffd33d },
    zIndex: LoungeVisualLayer.BALL,
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
      collisionMask:
        CollisionLayer.WORLD_STATIC |
        CollisionLayer.ITEM_SOLID |
        CollisionLayer.ITEM_SENSOR,
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
    version: spec.definitionVersion ?? 3,
    displayName: spec.label,
    visual: {
      size: spec.size,
      spriteId: "lounge.stamp.transparent",
      zIndex: spec.visualLayer ?? LoungeVisualLayer.PROP,
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
      zIndex: LoungeVisualLayer.DECAL,
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
  const earnedProps = new Set(
    inventory
      .filter(({ item }) => item.kind === "lounge_prop")
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
    ...compositeLoungeItems.filter(
      ({ id, source }) => source === "earned" && earnedProps.has(id),
    ),
  ];
}

export function loungePrizeItem(
  item: Pick<PrizeItem, "assetId" | "kind">,
): LoungeItemChoice | undefined {
  if (item.kind === "lounge_prop") {
    if (item.assetId === beachBallProp.id) return beachBallProp;
    return compositeLoungeItems.find(
      ({ id, source }) => id === item.assetId && source === "earned",
    );
  }
  if (item.kind !== "lounge_stamp") return undefined;

  const stamp = itemCatalog.find(([id]) => id === item.assetId);
  return stamp ? stampChoice(stamp, "earned") : undefined;
}

export function loungeItemForDefinition(definitionId: string) {
  const item = itemCatalog.find(
    ([id]) => definitionId === `zoomigo-stamp-${id}`,
  );
  if (definitionId === systemBeachBall.definitionId) return systemBeachBall;
  if (definitionId === beachBallProp.definitionId) return beachBallProp;
  const prop = starlightStamps.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (prop) return prop;
  const sillyStamp = sillyStamps.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (sillyStamp) return sillyStamp;
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
    collisionMask: CollisionLayer.WORLD_STATIC | CollisionLayer.ITEM_SOLID,
    restitution: 0.75,
    friction: 0.15,
  };
}

function solidCircle(id: string, radius: number) {
  return {
    id,
    role: "itemSolid" as const,
    shape: { type: "circle" as const, radius },
    collisionMask: CollisionLayer.WORLD_STATIC | CollisionLayer.ITEM_SOLID,
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
