import type { AvatarCatalog, AvatarLoadout, AvatarMotionState } from "../types";
import type { AnimationClip, Object3D } from "three";

export interface LoadedAvatar {
  scene: Object3D;
  animations: AnimationClip[];
  equippedItemIDs: readonly string[];
  warnings: readonly AvatarAssemblyWarning[];
}

export interface AvatarAssemblyWarning {
  itemId: string;
  reason: "asset-load-failed" | "asset-invalid";
}

export interface AvatarAssetLoader {
  load(url: string): Promise<LoadedAvatar>;
}

export interface AvatarCatalogLoader {
  load(url: string): Promise<AvatarCatalog>;
}

export interface AvatarPresentationSource {
  catalogURL: string;
  loadout: AvatarLoadout;
}

export interface AvatarPresentationLoader {
  load(source: AvatarPresentationSource): Promise<LoadedAvatar>;
}

export interface AvatarRenderBackend {
  initialize(canvas: HTMLCanvasElement): void | Promise<void>;
  attach(avatar: LoadedAvatar): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setView(rotationRadians: number): void;
  setMotion(motion: AvatarMotionState, reducedMotion: boolean): void;
  dispose(): void;
}

export type AvatarRuntimeState =
  | { kind: "loading" }
  | {
      kind: "ready";
      animationNames: readonly string[];
      equippedItemIDs: readonly string[];
      warnings: readonly AvatarAssemblyWarning[];
    }
  | {
      kind: "unavailable";
      reason: "renderer-init-failed" | "asset-load-failed";
    };
