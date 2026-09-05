import type { Object3D } from "three";

import { resolveAvatarLoadout } from "../loadout";
import type { AvatarBodyRegion, AvatarCatalog } from "../types";
import { AvatarMaterialFactory } from "./AvatarMaterialFactory";
import { SkinnedItemBinder } from "./SkinnedItemBinder";
import type {
  AvatarAssemblyWarning,
  AvatarAssetLoader,
  LoadedAvatar,
} from "./types";

export class AvatarAssembler {
  constructor(
    private readonly loader: AvatarAssetLoader,
    private readonly materials = new AvatarMaterialFactory(),
    private readonly skinnedItems = new SkinnedItemBinder(),
  ) {}

  async assemble(
    catalog: AvatarCatalog,
    loadout: unknown,
  ): Promise<LoadedAvatar> {
    const resolved = resolveAvatarLoadout(catalog, loadout);
    const baseAsset = resolved.base.assets.lod0;
    if (!baseAsset) throw new Error("base avatar is missing lod0");
    const base = await this.loader.load(baseAsset.url);
    if (base.scene.userData.rigVersion !== catalog.rigVersion) {
      throw new Error("base avatar rig version is missing or unsupported");
    }
    this.materials.applySkinTone(base.scene, resolved.skinTone.value);

    const warnings: AvatarAssemblyWarning[] = [];
    const equippedItemIDs = [resolved.base.id];
    const hiddenRegions = new Set<AvatarBodyRegion>();
    const results = await Promise.all(
      resolved.items.map(async (selection) => {
        const asset = selection.item.assets.lod0;
        if (!asset) return { selection, loaded: undefined };
        try {
          return { selection, loaded: await this.loader.load(asset.url) };
        } catch {
          return { selection, loaded: undefined };
        }
      }),
    );

    for (const { selection, loaded } of results) {
      if (!loaded) {
        warnings.push({
          itemId: selection.item.id,
          reason: "asset-load-failed",
        });
        continue;
      }
      if (
        loaded.scene.userData.rigVersion !== catalog.rigVersion ||
        loaded.scene.userData.itemId !== selection.item.id
      ) {
        warnings.push({ itemId: selection.item.id, reason: "asset-invalid" });
        continue;
      }
      if (selection.color) {
        this.materials.applyTint(loaded.scene, selection.color.value);
      }
      const attached =
        selection.item.kind === "skinned"
          ? this.skinnedItems.bind(base.scene, loaded.scene)
          : attachSocketCosmetic(base.scene, loaded.scene);
      if (!attached) {
        warnings.push({ itemId: selection.item.id, reason: "asset-invalid" });
        continue;
      }
      equippedItemIDs.push(selection.item.id);
      for (const region of selection.item.hideBodyRegions) {
        hiddenRegions.add(region);
      }
    }

    base.scene.traverse((object) => {
      const region = object.userData.bodyRegion as AvatarBodyRegion | undefined;
      if (region && hiddenRegions.has(region)) object.visible = false;
    });

    return {
      scene: base.scene,
      animations: base.animations,
      equippedItemIDs,
      warnings,
    };
  }
}

function attachSocketCosmetic(avatar: Object3D, cosmetic: Object3D): boolean {
  const parts = [...cosmetic.children];
  if (parts.length === 0) return false;
  const attachments = parts.map((part) => {
    const socketName = part.userData.socket;
    return typeof socketName === "string"
      ? { part, socket: avatar.getObjectByName(socketName) }
      : { part, socket: undefined };
  });
  if (attachments.some(({ socket }) => !socket)) return false;
  for (const { part, socket } of attachments) socket?.add(part);
  return true;
}
