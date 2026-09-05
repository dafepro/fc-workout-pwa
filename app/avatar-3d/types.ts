export const AVATAR_SCHEMA_VERSION = 1 as const;
export const AVATAR_RIG_VERSION = "zoomigo-humanoid-v1" as const;

export const AVATAR_BODY_REGIONS = [
  "head_neck",
  "torso",
  "upper_arm_l",
  "upper_arm_r",
  "lower_arm_hand_l",
  "lower_arm_hand_r",
  "upper_leg_l",
  "upper_leg_r",
  "lower_leg_foot_l",
  "lower_leg_foot_r",
] as const;

export const AVATAR_SLOTS = [
  "hair",
  "face",
  "top",
  "bottom",
  "feet",
  "headwear",
  "eyewear",
  "back",
  "wrist_l",
  "wrist_r",
  "held",
] as const;

export type AvatarSlot = (typeof AVATAR_SLOTS)[number];
export type AvatarBodyRegion = (typeof AVATAR_BODY_REGIONS)[number];
export type AvatarItemKind = "base" | "skinned" | "socket";
export type AvatarMaterialMode = "fixed" | "tint1" | "palette3";
export type AvatarLOD = "lod0" | "lod1" | "lod2";

export interface AvatarAssetReference {
  url: string;
  sha256: string;
  bytes: number;
}

export interface AvatarCatalogItem {
  id: string;
  version: number;
  displayName: string;
  kind: AvatarItemKind;
  slot?: AvatarSlot;
  rigVersion: string;
  assets: Partial<Record<AvatarLOD, AvatarAssetReference>>;
  hideBodyRegions: readonly AvatarBodyRegion[];
  hideSlots: readonly AvatarSlot[];
  requiresTags: readonly string[];
  excludesTags: readonly string[];
  materialMode: AvatarMaterialMode;
  variants: readonly string[];
  tags: readonly string[];
  collectionId?: string;
  active: boolean;
}

export interface AvatarCatalog {
  schemaVersion: typeof AVATAR_SCHEMA_VERSION;
  catalogVersion: string;
  rigVersion: string;
  colors: readonly AvatarColorDefinition[];
  items: readonly AvatarCatalogItem[];
}

export interface AvatarColorDefinition {
  id: string;
  displayName: string;
  value: string;
}

export interface EquippedAvatarItem {
  itemId: string;
  variantId?: string;
}

export interface AvatarLoadout {
  schemaVersion: typeof AVATAR_SCHEMA_VERSION;
  rigVersion: string;
  baseId: string;
  appearance: {
    skinToneId: string;
    faceId: string;
    hairId: string;
  };
  slots: Partial<Record<AvatarSlot, EquippedAvatarItem>>;
  animations: {
    idle: string;
    celebration: string;
    entrance?: string;
    reaction?: string;
  };
  effects: readonly string[];
}

export interface AvatarEmoteEvent {
  clipId: string;
  startedAt: number;
}

export interface AvatarMotionInput {
  speed: number;
  facingRadians: number;
  grounded: boolean;
  emote?: AvatarEmoteEvent;
}

export type AvatarMotionState =
  | { kind: "idle" }
  | { kind: "walk" }
  | { kind: "run" }
  | ({ kind: "emote" } & AvatarEmoteEvent);
