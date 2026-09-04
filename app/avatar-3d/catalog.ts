import {
  AVATAR_SCHEMA_VERSION,
  AVATAR_SLOTS,
  type AvatarAssetReference,
  type AvatarCatalog,
  type AvatarCatalogItem,
  type AvatarItemKind,
  type AvatarLOD,
  type AvatarMaterialMode,
} from "./types";

const ITEM_KINDS = new Set<AvatarItemKind>(["base", "skinned", "socket"]);
const MATERIAL_MODES = new Set<AvatarMaterialMode>([
  "fixed",
  "tint1",
  "palette3",
]);
const LODS = ["lod0", "lod1", "lod2"] as const satisfies readonly AvatarLOD[];
const HASH = /^[a-f0-9]{64}$/u;

export function parseAvatarCatalog(input: unknown): AvatarCatalog {
  if (!isRecord(input)) throw new Error("avatar catalog must be an object");
  if (input.schemaVersion !== AVATAR_SCHEMA_VERSION) {
    throw new Error(
      "unsupported avatar catalog schema: " + input.schemaVersion,
    );
  }
  if (!isNonEmptyString(input.rigVersion)) {
    throw new Error("avatar catalog rigVersion is required");
  }
  if (!Array.isArray(input.items)) {
    throw new Error("avatar catalog items must be an array");
  }

  const itemIDs = new Set<string>();
  for (const candidate of input.items) {
    const item = parseItem(candidate, input.rigVersion);
    if (itemIDs.has(item.id)) {
      throw new Error("duplicate avatar item id: " + item.id);
    }
    itemIDs.add(item.id);
  }

  return input as unknown as AvatarCatalog;
}

function parseItem(
  input: unknown,
  catalogRigVersion: string,
): AvatarCatalogItem {
  if (!isRecord(input) || !isNonEmptyString(input.id)) {
    throw new Error("avatar item id is required");
  }
  const id = input.id;

  if (!Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new Error(id + " version must be a positive integer");
  }
  if (!isNonEmptyString(input.displayName)) {
    throw new Error(id + " displayName is required");
  }
  if (
    !isNonEmptyString(input.kind) ||
    !ITEM_KINDS.has(input.kind as AvatarItemKind)
  ) {
    throw new Error(id + " kind is invalid");
  }
  if (
    input.slot !== undefined &&
    (!isNonEmptyString(input.slot) ||
      !AVATAR_SLOTS.includes(input.slot as (typeof AVATAR_SLOTS)[number]))
  ) {
    throw new Error(id + " slot is invalid");
  }
  if (!isNonEmptyString(input.rigVersion)) {
    throw new Error(id + " rigVersion is required");
  }
  if (input.rigVersion !== catalogRigVersion) {
    throw new Error(id + " rigVersion must match the catalog");
  }
  if (!isRecord(input.assets) || !isAsset(input.assets.lod0)) {
    throw new Error(id + " assets.lod0 must be a content-addressed GLB");
  }
  for (const lod of LODS.slice(1)) {
    if (input.assets[lod] !== undefined && !isAsset(input.assets[lod])) {
      throw new Error(
        id + " assets." + lod + " must be a content-addressed GLB",
      );
    }
  }
  if (
    !isNonEmptyString(input.materialMode) ||
    !MATERIAL_MODES.has(input.materialMode as AvatarMaterialMode)
  ) {
    throw new Error(id + " materialMode is invalid");
  }
  for (const field of ["hideBodyRegions", "variants", "tags"] as const) {
    if (!isStringArray(input[field])) {
      throw new Error(id + " " + field + " must be a string array");
    }
  }
  if (typeof input.active !== "boolean") {
    throw new Error(id + " active must be a boolean");
  }

  return input as unknown as AvatarCatalogItem;
}

function isAsset(input: unknown): input is AvatarAssetReference {
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.url) ||
    !isNonEmptyString(input.sha256) ||
    !HASH.test(input.sha256) ||
    !Number.isInteger(input.bytes) ||
    (input.bytes as number) < 1
  ) {
    return false;
  }

  return input.url.endsWith("/" + input.sha256 + ".glb");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every(isNonEmptyString);
}
