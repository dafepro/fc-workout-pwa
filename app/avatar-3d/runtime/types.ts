import type { AvatarMotionState } from "../types";
import type { AnimationClip, Object3D } from "three";

export interface LoadedAvatar {
  scene: Object3D;
  animations: AnimationClip[];
}

export interface AvatarAssetLoader {
  load(url: string): Promise<LoadedAvatar>;
}

export interface AvatarRenderBackend {
  initialize(canvas: HTMLCanvasElement): void | Promise<void>;
  attach(avatar: LoadedAvatar): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setMotion(motion: AvatarMotionState, reducedMotion: boolean): void;
  dispose(): void;
}

export type AvatarRuntimeState =
  | { kind: "loading" }
  | { kind: "ready"; animationNames: readonly string[] }
  | {
      kind: "unavailable";
      reason: "renderer-init-failed" | "asset-load-failed";
    };
