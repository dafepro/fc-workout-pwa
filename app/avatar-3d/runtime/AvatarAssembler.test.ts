import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
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
  colors: [
    { id: "lime", displayName: "Lime", value: "#c8f52a" },
    { id: "skin.medium", displayName: "Medium", value: "#a96943" },
  ],
  items: [
    item("base.zoomigo.reference", "base", undefined, baseURL, "a"),
    item("hair.curl.reference", "socket", "hair", hairURL, "c"),
    item("top.training.reference", "skinned", "top", topURL, "b", {
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
        [topURL, skinnedCosmetic("top.training.reference")],
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
    expect(top.parent?.name).toBe("ZoomigoAvatar");
    expect(top).toBeInstanceOf(SkinnedMesh);
    expect((top as SkinnedMesh).skeleton.bones[0]).toBe(
      assembled.scene.getObjectByName("hips"),
    );
    expect((top.material as MeshStandardMaterial).color).toEqual(
      new Color("#c8f52a"),
    );
    expect(
      (assembled.scene.getObjectByName("body.hand-l") as Mesh).material,
    ).toMatchObject({ color: new Color("#a96943") });
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
  const hand = new Mesh(
    new BoxGeometry(),
    new MeshStandardMaterial({ color: "#ffffff" }),
  );
  hand.name = "body.hand-l";
  hand.userData.skinTintable = true;
  const hips = new Bone();
  hips.name = "hips";
  const chestBone = new Bone();
  chestBone.name = "chest";
  hips.add(chestBone);
  root.add(chest, head, torso, hand, hips);
  return {
    scene: root,
    animations: [new AnimationClip("idle_default", 1, [])],
    equippedItemIDs: [],
    warnings: [],
  };
}

function skinnedCosmetic(itemId: string): LoadedAvatar {
  const root = new Group();
  root.userData = { itemId, rigVersion: "zoomigo-humanoid-v1" };
  const hips = new Bone();
  hips.name = "hips";
  const chest = new Bone();
  chest.name = "chest";
  hips.add(chest);
  const geometry = new BoxGeometry();
  const vertexCount = geometry.attributes.position.count;
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    indices[index * 4] = 1;
    weights[index * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const part = new SkinnedMesh(geometry, new MeshStandardMaterial());
  part.name = `${itemId}.part`;
  part.userData.tintable = true;
  root.add(hips, part);
  part.bind(new Skeleton([hips, chest]));
  return { scene: root, animations: [], equippedItemIDs: [], warnings: [] };
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
  kind: "base" | "skinned" | "socket",
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
