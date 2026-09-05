export { parseAvatarCatalog } from "./catalog";
export { parseAvatarLoadout, resolveAvatarLoadout } from "./loadout";
export { AvatarStage } from "./AvatarStage";
export type {
  AvatarStageRuntime,
  AvatarStageRuntimeFactory,
} from "./AvatarStage";
export { resolveAvatarMotion } from "./motion";
export {
  AVATAR_RIG_VERSION,
  AVATAR_SCHEMA_VERSION,
  AVATAR_BODY_REGIONS,
  AVATAR_SLOTS,
} from "./types";
export type {
  AvatarAssetReference,
  AvatarBodyRegion,
  AvatarCatalog,
  AvatarColorDefinition,
  AvatarCatalogItem,
  AvatarEmoteEvent,
  AvatarItemKind,
  AvatarLoadout,
  AvatarLOD,
  AvatarMaterialMode,
  AvatarMotionInput,
  AvatarMotionState,
  AvatarSlot,
  EquippedAvatarItem,
} from "./types";
