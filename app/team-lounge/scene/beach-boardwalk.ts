import {
  CollisionLayer,
  type CanvasDefinition,
  type ItemDefinition,
} from "@canvas-physics/core";

import { defaultLoungeBallConfig } from "../lounge-ball-behavior";

export const beachBallDefinition: ItemDefinition = {
  definitionId: "beach-ball",
  version: 6,
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

export const loungeActionRouterDefinition: ItemDefinition = {
  definitionId: "zoomigo-lounge-action-router",
  version: 1,
  displayName: "Lounge action router",
  visual: {
    size: { width: 0.1, height: 0.1 },
    spriteId: "lounge.stamp.transparent",
    zIndex: 0,
  },
  colliders: [],
  behaviorType: "zoomigoLoungeActions",
  defaultConfig: {},
  persistence: { transform: false, behaviorState: false, onRoomSleep: "pause" },
  complexity: "simple",
};

export const beachBoardwalkDefinitions = [
  beachBallDefinition,
  loungeAvatarDefinition,
  loungeActionRouterDefinition,
];

export const beachBoardwalkCanvas: CanvasDefinition = {
  id: "zoomigo-beach-boardwalk",
  version: 13,
  size: { width: 100, height: 150 },
  orientation: "topDown",
  backgroundAssetId: "lounge.background",
  edges: {
    top: "open",
    right: "open",
    bottom: "open",
    left: "open",
  },
  staticGeometry: [
    {
      id: "elastic-edge-top",
      shape: { type: "rect", width: 104, height: 2 },
      position: { x: 50, y: -1 },
      restitution: 1,
      friction: 0,
      tags: ["elastic-edge"],
      blocks: { avatars: true, items: true },
    },
    {
      id: "elastic-edge-right",
      shape: { type: "rect", width: 2, height: 154 },
      position: { x: 101, y: 75 },
      restitution: 1,
      friction: 0,
      tags: ["elastic-edge"],
      blocks: { avatars: true, items: true },
    },
    {
      id: "elastic-edge-bottom",
      shape: { type: "rect", width: 104, height: 2 },
      position: { x: 50, y: 151 },
      restitution: 1,
      friction: 0,
      tags: ["elastic-edge"],
      blocks: { avatars: true, items: true },
    },
    {
      id: "elastic-edge-left",
      shape: { type: "rect", width: 2, height: 154 },
      position: { x: -1, y: 75 },
      restitution: 1,
      friction: 0,
      tags: ["elastic-edge"],
      blocks: { avatars: true, items: true },
    },
  ],
  regions: [],
  environment: {
    base: {
      gravityXY: { x: 0, y: 0 },
      linearDrag: 0.03,
      angularDrag: 0.06,
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
    {
      entityId: "lounge-action-router",
      definitionId: loungeActionRouterDefinition.definitionId,
      definitionVersion: loungeActionRouterDefinition.version,
      transform: { x: 0, y: 0, rotation: 0, scale: 1 },
      resolvedConfig: {},
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
