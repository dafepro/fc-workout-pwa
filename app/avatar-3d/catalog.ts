import {
  AVATAR_BODY_REGIONS,
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
  assertKnownFields(
    input,
    ["schemaVersion", "catalogVersion", "rigVersion", "colors", "items"],
    "avatar catalog",
  );
  if (input.schemaVersion !== AVATAR_SCHEMA_VERSION) {
    throw new Error(
      "unsupported avatar catalog schema: " + input.schemaVersion,
    );
  }
  if (!isNonEmptyString(input.rigVersion)) {
    throw new Error("avatar catalog rigVersion is required");
  }
  if (!isNonEmptyString(input.catalogVersion)) {
    throw new Error("avatar catalog catalogVersion is required");
  }
  if (!Array.isArray(input.colors)) {
    throw new Error("avatar catalog colors must be an array");
  }
  if (!Array.isArray(input.items)) {
    throw new Error("avatar catalog items must be an array");
  }

  const colorIDs = new Set<string>();
  for (const color of input.colors) {
    if (!isRecord(color)) throw new Error("avatar color must be an object");
    assertKnownFields(color, ["id", "displayName", "value"], "avatar color");
    if (!isNonEmptyString(color.id))
      throw new Error("avatar color id is required");
    if (colorIDs.has(color.id))
      throw new Error("duplicate avatar color id: " + color.id);
    if (!isNonEmptyString(color.displayName)) {
      throw new Error(color.id + " displayName is required");
    }
    if (
      typeof color.value !== "string" ||
      !/^#[a-f0-9]{6}$/iu.test(color.value)
    ) {
      throw new Error(color.id + " value must be a hex color");
    }
    colorIDs.add(color.id);
  }

  const itemIDs = new Set<string>();
  for (const candidate of input.items) {
    const item = parseItem(candidate, input.rigVersion, colorIDs);
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
  colorIDs: ReadonlySet<string>,
): AvatarCatalogItem {
  if (!isRecord(input) || !isNonEmptyString(input.id)) {
    throw new Error("avatar item id is required");
  }
  const id = input.id;
  assertKnownFields(
    input,
    [
      "id",
      "version",
      "displayName",
      "kind",
      "slot",
      "rigVersion",
      "assets",
      "hideBodyRegions",
      "hideSlots",
      "requiresTags",
      "excludesTags",
      "materialMode",
      "variants",
      "tags",
      "collectionId",
      "active",
    ],
    id,
  );

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
  if (input.kind === "base" && input.slot !== undefined) {
    throw new Error(id + " base items cannot declare a slot");
  }
  if (input.kind !== "base" && input.slot === undefined) {
    throw new Error(id + " non-base items require a slot");
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
  for (const field of [
    "hideBodyRegions",
    "hideSlots",
    "requiresTags",
    "excludesTags",
    "variants",
    "tags",
  ] as const) {
    if (!isStringArray(input[field])) {
      throw new Error(id + " " + field + " must be a string array");
    }
  }
  for (const region of input.hideBodyRegions as string[]) {
    if (
      !AVATAR_BODY_REGIONS.includes(
        region as (typeof AVATAR_BODY_REGIONS)[number],
      )
    ) {
      throw new Error(id + " hideBodyRegions contains an invalid region");
    }
  }
  for (const slot of input.hideSlots as string[]) {
    if (!AVATAR_SLOTS.includes(slot as (typeof AVATAR_SLOTS)[number])) {
      throw new Error(id + " hideSlots contains an invalid slot");
    }
  }
  if (
    input.materialMode === "fixed" &&
    (input.variants as string[]).length > 0
  ) {
    throw new Error(id + " fixed materials cannot declare variants");
  }
  if (
    input.materialMode === "tint1" &&
    (input.variants as string[]).length === 0
  ) {
    throw new Error(id + " tint1 materials require variants");
  }
  for (const variant of input.variants as string[]) {
    if (!colorIDs.has(variant)) {
      throw new Error(id + " references unknown color " + variant);
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

function assertKnownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unknown field: ${unknown}`);
}
