import { describe, expect, it } from "vitest";

import { parseAvatarCatalog } from "./catalog";

const validCatalog = {
  schemaVersion: 1,
  rigVersion: "zoomigo-humanoid-v1",
  items: [
    {
      id: "top.street-jersey.001",
      version: 1,
      displayName: "Street Striker Jersey",
      kind: "skinned",
      slot: "top",
      rigVersion: "zoomigo-humanoid-v1",
      assets: {
        lod0: {
          url: `/avatar/assets/${"a".repeat(64)}.glb`,
          sha256: "a".repeat(64),
          bytes: 184_221,
        },
      },
      hideBodyRegions: ["torso"],
      materialMode: "tint1",
      variants: ["maroon", "white"],
      tags: ["soccer", "street"],
      active: true,
    },
  ],
};

describe("parseAvatarCatalog", () => {
  it("accepts a versioned, content-driven catalog", () => {
    expect(parseAvatarCatalog(validCatalog)).toEqual(validCatalog);
  });

  it("rejects duplicate permanent item IDs", () => {
    expect(() =>
      parseAvatarCatalog({
        ...validCatalog,
        items: [validCatalog.items[0], validCatalog.items[0]],
      }),
    ).toThrow("duplicate avatar item id: top.street-jersey.001");
  });

  it("rejects assets that are not immutable hashed GLB paths", () => {
    expect(() =>
      parseAvatarCatalog({
        ...validCatalog,
        items: [
          {
            ...validCatalog.items[0],
            assets: {
              lod0: {
                url: "/avatar/assets/latest.glb",
                sha256: "",
                bytes: 184_221,
              },
            },
          },
        ],
      }),
    ).toThrow("top.street-jersey.001 assets.lod0");
  });

  it("rejects items authored for a different rig", () => {
    expect(() =>
      parseAvatarCatalog({
        ...validCatalog,
        items: [
          {
            ...validCatalog.items[0],
            rigVersion: "zoomigo-humanoid-v2",
          },
        ],
      }),
    ).toThrow("top.street-jersey.001 rigVersion must match the catalog");
  });
});
