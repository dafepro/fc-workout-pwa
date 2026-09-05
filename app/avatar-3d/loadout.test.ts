import { describe, expect, it } from "vitest";

import { parseAvatarCatalog } from "./catalog";
import { parseAvatarLoadout, resolveAvatarLoadout } from "./loadout";

const hash = "a".repeat(64);
const asset = {
  url: `/avatar/assets/${hash}.glb`,
  sha256: hash,
  bytes: 100,
};

const catalog = parseAvatarCatalog({
  schemaVersion: 1,
  catalogVersion: "reference-1",
  rigVersion: "zoomigo-humanoid-v1",
  colors: [
    { id: "lime", displayName: "Lime", value: "#c8f52a" },
    { id: "violet", displayName: "Violet", value: "#6954ee" },
    { id: "skin.medium", displayName: "Medium", value: "#a96943" },
  ],
  items: [
    item("base.zoomigo.reference", "base"),
    item("hair.curl.reference", "socket", "hair"),
    item("top.training.reference", "socket", "top", {
      materialMode: "tint1",
      variants: ["lime", "violet"],
      hideBodyRegions: ["torso"],
      tags: ["training-top"],
    }),
    item("headwear.cap.reference", "socket", "headwear", {
      hideSlots: ["hair"],
    }),
    item("back.cape.reference", "socket", "back", {
      excludesTags: ["bulky-headwear"],
    }),
    item("headwear.helmet.reference", "socket", "headwear", {
      tags: ["bulky-headwear"],
    }),
  ],
});

const validLoadout = {
  schemaVersion: 1,
  rigVersion: "zoomigo-humanoid-v1",
  baseId: "base.zoomigo.reference",
  appearance: {
    skinToneId: "skin.medium",
    faceId: "face.default",
    hairId: "hair.curl.reference",
  },
  slots: {
    top: { itemId: "top.training.reference", variantId: "lime" },
  },
  animations: {
    idle: "idle_default",
    celebration: "celebration_jump",
  },
  effects: [],
};

describe("avatar loadout resolution", () => {
  it("resolves catalog items, tint variants, and covered body regions", () => {
    const resolved = resolveAvatarLoadout(catalog, validLoadout);

    expect(resolved.base.id).toBe("base.zoomigo.reference");
    expect(resolved.skinTone.value).toBe("#a96943");
    expect(resolved.items.map(({ item }) => item.id)).toEqual([
      "hair.curl.reference",
      "top.training.reference",
    ]);
    expect(resolved.items[1].color?.value).toBe("#c8f52a");
    expect([...resolved.hiddenBodyRegions]).toEqual(["torso"]);
  });

  it("rejects a skin tone outside the curated catalog", () => {
    expect(() =>
      resolveAvatarLoadout(catalog, {
        ...validLoadout,
        appearance: { ...validLoadout.appearance, skinToneId: "skin.unknown" },
      }),
    ).toThrow("unknown avatar skin tone: skin.unknown");
  });

  it("keeps a hidden selection in the loadout but omits it from assembly", () => {
    const resolved = resolveAvatarLoadout(catalog, {
      ...validLoadout,
      slots: {
        ...validLoadout.slots,
        headwear: { itemId: "headwear.cap.reference" },
      },
    });

    expect(resolved.loadout.appearance.hairId).toBe("hair.curl.reference");
    expect(resolved.hiddenSlots).toContain("hair");
    expect(resolved.items.map(({ item }) => item.id)).toEqual([
      "top.training.reference",
      "headwear.cap.reference",
    ]);
  });

  it.each([
    [
      "unknown item",
      {
        ...validLoadout,
        appearance: { ...validLoadout.appearance, hairId: "hair.nope" },
      },
      "unknown avatar item",
    ],
    [
      "wrong slot",
      {
        ...validLoadout,
        slots: {
          feet: { itemId: "top.training.reference", variantId: "lime" },
        },
      },
      "cannot be equipped in feet",
    ],
    [
      "unknown tint",
      {
        ...validLoadout,
        slots: {
          top: { itemId: "top.training.reference", variantId: "orange" },
        },
      },
      "does not support variant orange",
    ],
    [
      "incompatible tags",
      {
        ...validLoadout,
        slots: {
          headwear: { itemId: "headwear.helmet.reference" },
          back: { itemId: "back.cape.reference" },
        },
      },
      "conflicts with equipped tag bulky-headwear",
    ],
  ])("rejects an invalid %s", (_label, loadout, message) => {
    expect(() => resolveAvatarLoadout(catalog, loadout)).toThrow(message);
  });

  it("rejects unknown serialized fields", () => {
    expect(() =>
      parseAvatarLoadout({ ...validLoadout, arbitraryPlayerText: "unsafe" }),
    ).toThrow("unknown avatar loadout field: arbitraryPlayerText");
  });
});

function item(
  id: string,
  kind: "base" | "socket",
  slot?: "hair" | "top" | "headwear" | "back",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    version: 1,
    displayName: id,
    kind,
    ...(slot ? { slot } : {}),
    rigVersion: "zoomigo-humanoid-v1",
    assets: { lod0: asset },
    hideBodyRegions: [],
    hideSlots: [],
    requiresTags: [],
    excludesTags: [],
    materialMode: "fixed",
    variants: [],
    tags: [],
    active: true,
    ...overrides,
  };
}
