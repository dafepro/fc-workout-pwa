import {
  CollisionLayer,
  type CanvasDefinition,
  type ItemDefinition,
} from "@canvas-physics/core";

import { defaultLoungeBallConfig } from "../lounge-ball-behavior";

export const beachBallDefinition: ItemDefinition = {
  definitionId: "beach-ball",
  version: 4,
  displayName: "Beach ball",
  visual: {
    size: { width: 9, height: 9 },
    spriteId: "lounge.ball",
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
      collisionMask:
        CollisionLayer.WORLD_STATIC |
        CollisionLayer.ITEM_SOLID |
        CollisionLayer.ITEM_SENSOR |
        CollisionLayer.REGION_SENSOR,
    },
    { id: "kick", role: "itemSensor", shape: { type: "circle", radius: 5.8 } },
  ],
  behaviorType: "zoomigoLoungeBall",
  defaultConfig: defaultLoungeBallConfig,
  persistence: { transform: true, behaviorState: true, onRoomSleep: "pause" },
  complexity: "simple",
};

export const loungeAvatarDefinition: ItemDefinition = {
  definitionId: "avatar",
  version: 1,
  displayName: "Player avatar",
  visual: {
    size: { width: 9, height: 9 },
    spriteId: "lounge.avatar",
    placeholder: { shape: "circle", color: 0x1d5a87 },
    zIndex: 12,
  },
  colliders: [],
  defaultConfig: {},
  persistence: { transform: false, behaviorState: false, onRoomSleep: "pause" },
  complexity: "simple",
};

export const beachBoardwalkDefinitions = [
  beachBallDefinition,
  loungeAvatarDefinition,
];

export const beachBoardwalkCanvas: CanvasDefinition = {
  id: "zoomigo-beach-boardwalk",
  version: 8,
  size: { width: 100, height: 150 },
  orientation: "topDown",
  backgroundAssetId: "lounge.background",
  edges: {
    top: "solid",
    right: "solid",
    bottom: "solid",
    left: "solid",
  },
  staticGeometry: [
    {
      id: "lifeguard-hut",
      shape: { type: "rect", width: 38, height: 42 },
      position: { x: 79, y: 27 },
      rotation: 0,
      blocks: { avatars: true, items: false },
    },
    {
      id: "umbrella-table",
      shape: { type: "circle", radius: 14 },
      position: { x: 18, y: 36 },
      rotation: 0,
      blocks: { avatars: true, items: false },
    },
    {
      id: "boardwalk-bench",
      shape: { type: "rect", width: 31, height: 21 },
      position: { x: 16, y: 108 },
      rotation: -0.12,
      blocks: { avatars: true, items: false },
    },
    {
      id: "snack-cart",
      shape: { type: "rect", width: 28, height: 49 },
      position: { x: 88, y: 116.5 },
      rotation: 0.02,
      blocks: { avatars: true, items: false },
    },
    {
      id: "lower-pool-edge",
      shape: { type: "rect", width: 76, height: 16 },
      position: { x: 25, y: 141 },
      rotation: 0.29,
      blocks: { avatars: true, items: false },
    },
  ],
  regions: [],
  environment: {
    base: {
      gravityXY: { x: 0, y: 0 },
      linearDrag: 0.07,
      angularDrag: 0.1,
      softSpeedLimit: 40,
      surfaceFrictionMultiplier: 1,
    },
  },
  spawnPoints: [{ id: "arrival", position: { x: 43, y: 92 } }],
  systemItems: [
    {
      entityId: "boardwalk-beach-ball",
      definitionId: beachBallDefinition.definitionId,
      definitionVersion: beachBallDefinition.version,
      transform: { x: 62, y: 98, rotation: 0, scale: 1 },
      resolvedConfig: beachBallDefinition.defaultConfig,
    },
  ],
  limits: { maxAvatars: 24, maxItems: 169, maxComplexPhysicsItems: 4 },
  avatarController: {
    radius: 4,
    maxSpeed: 26,
    acceleration: 125,
    flickDeceleration: 42,
    maxTurnSpeed: 9,
    facing: "fixed",
    directInteractionMaxSpeed: 32,
  },
  terrainDefaults: { avatars: true, items: true },
};
