import {
  AnimationClip,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { describe, expect, it } from "vitest";

import { parseAvatarCatalog } from "../catalog";
import { AvatarAssembler } from "./AvatarAssembler";
import type { AvatarAssetLoader, LoadedAvatar } from "./types";

const baseURL = `/avatar/assets/${"a".repeat(64)}.glb`;
const topURL = `/avatar/assets/${"b".repeat(64)}.glb`;
const hairURL = `/avatar/assets/${"c".repeat(64)}.glb`;

const catalog = parseAvatarCatalog({
  schemaVersion: 1,
  catalogVersion: "reference-1",
  rigVersion: "zoomigo-humanoid-v1",
  colors: [{ id: "lime", displayName: "Lime", value: "#c8f52a" }],
  items: [
    item("base.zoomigo.reference", "base", undefined, baseURL, "a"),
    item("hair.curl.reference", "socket", "hair", hairURL, "c"),
    item("top.training.reference", "socket", "top", topURL, "b", {
      hideBodyRegions: ["torso"],
      materialMode: "tint1",
      variants: ["lime"],
    }),
  ],
});

const loadout = {
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

describe("AvatarAssembler", () => {
  it("attaches modular pieces, applies tint, and hides covered body regions", async () => {
    const loader = new FakeLoader(
      new Map([
        [baseURL, baseAvatar()],
        [hairURL, cosmetic("hair.curl.reference", "socket_head")],
        [topURL, cosmetic("top.training.reference", "socket_chest")],
      ]),
    );

    const assembled = await new AvatarAssembler(loader).assemble(
      catalog,
      loadout,
    );

    expect(loader.requests).toEqual([baseURL, hairURL, topURL]);
    expect(
      assembled.scene.getObjectByName("hair.curl.reference.part"),
    ).toBeTruthy();
    const top = assembled.scene.getObjectByName(
      "top.training.reference.part",
    ) as Mesh;
    expect(top.parent?.name).toBe("socket_chest");
    expect((top.material as MeshStandardMaterial).color).toEqual(
      new Color("#c8f52a"),
    );
    expect(assembled.scene.getObjectByName("body.torso")?.visible).toBe(false);
    expect(assembled.warnings).toEqual([]);
  });

  it("keeps the base avatar usable when an optional cosmetic fails", async () => {
    const loader = new FakeLoader(
      new Map([
        [baseURL, baseAvatar()],
        [hairURL, cosmetic("hair.curl.reference", "socket_head")],
      ]),
    );

    const assembled = await new AvatarAssembler(loader).assemble(
      catalog,
      loadout,
    );

    expect(assembled.scene.name).toBe("ZoomigoAvatar");
    expect(
      assembled.scene.getObjectByName("hair.curl.reference.part"),
    ).toBeTruthy();
    expect(assembled.warnings).toEqual([
      { itemId: "top.training.reference", reason: "asset-load-failed" },
    ]);
  });
});

class FakeLoader implements AvatarAssetLoader {
  readonly requests: string[] = [];

  constructor(private readonly assets: Map<string, LoadedAvatar>) {}

  async load(url: string): Promise<LoadedAvatar> {
    this.requests.push(url);
    const asset = this.assets.get(url);
    if (!asset) throw new Error("missing test asset");
    return asset;
  }
}

function baseAvatar(): LoadedAvatar {
  const root = new Group();
  root.name = "ZoomigoAvatar";
  root.userData.rigVersion = "zoomigo-humanoid-v1";
  const chest = new Object3D();
  chest.name = "socket_chest";
  const head = new Object3D();
  head.name = "socket_head";
  const torso = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  torso.name = "body.torso";
  torso.userData.bodyRegion = "torso";
  root.add(chest, head, torso);
  return {
    scene: root,
    animations: [new AnimationClip("idle_default", 1, [])],
    equippedItemIDs: [],
    warnings: [],
  };
}

function cosmetic(itemId: string, socket: string): LoadedAvatar {
  const root = new Group();
  root.userData = { itemId, rigVersion: "zoomigo-humanoid-v1" };
  const part = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  part.name = `${itemId}.part`;
  part.userData = { socket, tintable: true };
  root.add(part);
  return { scene: root, animations: [], equippedItemIDs: [], warnings: [] };
}

function item(
  id: string,
  kind: "base" | "socket",
  slot: "hair" | "top" | undefined,
  url: string,
  hashCharacter: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    version: 1,
    displayName: id,
    kind,
    ...(slot ? { slot } : {}),
    rigVersion: "zoomigo-humanoid-v1",
    assets: {
      lod0: { url, sha256: hashCharacter.repeat(64), bytes: 100 },
    },
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
