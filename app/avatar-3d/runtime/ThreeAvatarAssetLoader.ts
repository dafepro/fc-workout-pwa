import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { AVATAR_RIG_VERSION } from "../types";
import type { AvatarAssetLoader, LoadedAvatar } from "./types";

const REQUIRED_CLIPS = ["idle_default", "walk", "run"] as const;

export class ThreeAvatarAssetLoader implements AvatarAssetLoader {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  async load(url: string): Promise<LoadedAvatar> {
    const gltf = await this.loader.loadAsync(url);
    const avatarRoot =
      gltf.scene.getObjectByName("ZoomigoAvatar") ??
      gltf.scene.getObjectByName("AvatarCosmetic") ??
      gltf.scene;

    if (avatarRoot.userData.rigVersion !== AVATAR_RIG_VERSION) {
      throw new Error("avatar rig version is missing or unsupported");
    }

    if (avatarRoot.name === "ZoomigoAvatar") {
      const clipNames = new Set(gltf.animations.map(({ name }) => name));
      if (REQUIRED_CLIPS.some((name) => !clipNames.has(name))) {
        throw new Error("avatar is missing a required locomotion clip");
      }
    }

    return {
      scene: avatarRoot,
      animations: gltf.animations,
      equippedItemIDs: [],
      warnings: [],
    };
  }
}
