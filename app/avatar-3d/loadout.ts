import {
  AVATAR_SCHEMA_VERSION,
  AVATAR_SLOTS,
  type AvatarBodyRegion,
  type AvatarCatalog,
  type AvatarCatalogItem,
  type AvatarColorDefinition,
  type AvatarLoadout,
  type AvatarSlot,
  type EquippedAvatarItem,
} from "./types";

export interface ResolvedAvatarItem {
  slot: AvatarSlot;
  item: AvatarCatalogItem;
  selection: EquippedAvatarItem;
  color?: AvatarColorDefinition;
}

export interface ResolvedAvatarLoadout {
  loadout: AvatarLoadout;
  base: AvatarCatalogItem;
  skinTone: AvatarColorDefinition;
  items: readonly ResolvedAvatarItem[];
  hiddenSlots: ReadonlySet<AvatarSlot>;
  hiddenBodyRegions: ReadonlySet<AvatarBodyRegion>;
}

export function parseAvatarLoadout(input: unknown): AvatarLoadout {
  if (!isRecord(input)) throw new Error("avatar loadout must be an object");
  assertKnownFields(
    input,
    [
      "schemaVersion",
      "rigVersion",
      "baseId",
      "appearance",
      "slots",
      "animations",
      "effects",
    ],
    "avatar loadout",
  );
  if (input.schemaVersion !== AVATAR_SCHEMA_VERSION) {
    throw new Error(
      "unsupported avatar loadout schema: " + input.schemaVersion,
    );
  }
  for (const field of ["rigVersion", "baseId"] as const) {
    if (!isNonEmptyString(input[field])) {
      throw new Error(`avatar loadout ${field} is required`);
    }
  }

  if (!isRecord(input.appearance)) {
    throw new Error("avatar loadout appearance is required");
  }
  assertKnownFields(
    input.appearance,
    ["skinToneId", "faceId", "hairId"],
    "avatar appearance",
  );
  for (const field of ["skinToneId", "faceId", "hairId"] as const) {
    if (!isNonEmptyString(input.appearance[field])) {
      throw new Error(`avatar appearance ${field} is required`);
    }
  }

  if (!isRecord(input.slots))
    throw new Error("avatar loadout slots are required");
  for (const [slot, selection] of Object.entries(input.slots)) {
    if (!AVATAR_SLOTS.includes(slot as AvatarSlot)) {
      throw new Error("unknown avatar slot: " + slot);
    }
    if (slot === "hair") {
      throw new Error("hair must be selected through appearance.hairId");
    }
    parseSelection(selection, slot);
  }

  if (!isRecord(input.animations)) {
    throw new Error("avatar loadout animations are required");
  }
  assertKnownFields(
    input.animations,
    ["idle", "celebration", "entrance", "reaction"],
    "avatar animations",
  );
  for (const field of ["idle", "celebration"] as const) {
    if (!isNonEmptyString(input.animations[field])) {
      throw new Error(`avatar animation ${field} is required`);
    }
  }
  for (const field of ["entrance", "reaction"] as const) {
    if (
      input.animations[field] !== undefined &&
      !isNonEmptyString(input.animations[field])
    ) {
      throw new Error(`avatar animation ${field} is invalid`);
    }
  }
  if (!isStringArray(input.effects)) {
    throw new Error("avatar loadout effects must be a string array");
  }

  return input as unknown as AvatarLoadout;
}

export function resolveAvatarLoadout(
  catalog: AvatarCatalog,
  input: unknown,
): ResolvedAvatarLoadout {
  const loadout = parseAvatarLoadout(input);
  if (loadout.rigVersion !== catalog.rigVersion) {
    throw new Error("avatar loadout rigVersion must match the catalog");
  }

  const itemsByID = new Map(catalog.items.map((item) => [item.id, item]));
  const colorsByID = new Map(catalog.colors.map((color) => [color.id, color]));
  const base = requiredItem(itemsByID, loadout.baseId);
  if (base.kind !== "base") throw new Error(base.id + " is not a base avatar");
  const skinTone = colorsByID.get(loadout.appearance.skinToneId);
  if (!skinTone) {
    throw new Error(
      "unknown avatar skin tone: " + loadout.appearance.skinToneId,
    );
  }

  const selected: ResolvedAvatarItem[] = [
    resolveSelection(itemsByID, colorsByID, "hair", {
      itemId: loadout.appearance.hairId,
    }),
  ];
  for (const slot of AVATAR_SLOTS) {
    if (slot === "hair") continue;
    const selection = loadout.slots[slot];
    if (selection) {
      selected.push(resolveSelection(itemsByID, colorsByID, slot, selection));
    }
  }

  const hiddenSlots = new Set(selected.flatMap(({ item }) => item.hideSlots));
  const items = selected.filter(({ slot }) => !hiddenSlots.has(slot));
  const equippedTags = new Set(items.flatMap(({ item }) => item.tags));
  for (const { item } of items) {
    for (const required of item.requiresTags) {
      if (!equippedTags.has(required)) {
        throw new Error(`${item.id} requires equipped tag ${required}`);
      }
    }
    for (const excluded of item.excludesTags) {
      if (equippedTags.has(excluded)) {
        throw new Error(`${item.id} conflicts with equipped tag ${excluded}`);
      }
    }
  }

  return {
    loadout,
    base,
    skinTone,
    items,
    hiddenSlots,
    hiddenBodyRegions: new Set(
      items.flatMap(({ item }) => item.hideBodyRegions),
    ),
  };
}

function resolveSelection(
  itemsByID: ReadonlyMap<string, AvatarCatalogItem>,
  colorsByID: ReadonlyMap<string, AvatarColorDefinition>,
  slot: AvatarSlot,
  selection: EquippedAvatarItem,
): ResolvedAvatarItem {
  const item = requiredItem(itemsByID, selection.itemId);
  if (item.slot !== slot) {
    throw new Error(`${item.id} cannot be equipped in ${slot}`);
  }

  if (item.materialMode === "fixed") {
    if (selection.variantId !== undefined) {
      throw new Error(`${item.id} does not support variants`);
    }
    return { slot, item, selection };
  }

  if (!selection.variantId || !item.variants.includes(selection.variantId)) {
    throw new Error(
      `${item.id} does not support variant ${selection.variantId ?? "<missing>"}`,
    );
  }
  const color = colorsByID.get(selection.variantId);
  if (!color) throw new Error(`${item.id} references an unknown color`);
  return { slot, item, selection, color };
}

function requiredItem(
  itemsByID: ReadonlyMap<string, AvatarCatalogItem>,
  id: string,
): AvatarCatalogItem {
  const item = itemsByID.get(id);
  if (!item) throw new Error("unknown avatar item: " + id);
  if (!item.active) throw new Error("inactive avatar item: " + id);
  return item;
}

function parseSelection(input: unknown, slot: string): void {
  if (!isRecord(input)) throw new Error(`avatar slot ${slot} is invalid`);
  assertKnownFields(input, ["itemId", "variantId"], `avatar slot ${slot}`);
  if (!isNonEmptyString(input.itemId)) {
    throw new Error(`avatar slot ${slot} itemId is required`);
  }
  if (input.variantId !== undefined && !isNonEmptyString(input.variantId)) {
    throw new Error(`avatar slot ${slot} variantId is invalid`);
  }
}

function assertKnownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`unknown ${label} field: ${unknown}`);
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
