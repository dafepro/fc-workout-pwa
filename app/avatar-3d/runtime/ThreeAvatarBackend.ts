import {
  AgXToneMapping,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";

import type { AvatarMotionState } from "../types";
import type { AvatarRenderBackend, LoadedAvatar } from "./types";

const TARGET_HEIGHT = 3.2;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const CROSS_FADE_SECONDS = 0.15;

export class ThreeAvatarBackend implements AvatarRenderBackend {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 100);
  private renderer?: WebGLRenderer;
  private avatar?: Object3D;
  private mixer?: AnimationMixer;
  private animations: AnimationClip[] = [];
  private action?: AnimationAction;
  private animationLoopActive = false;
  private lastFrameTime = 0;

  initialize(canvas: HTMLCanvasElement): void {
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(new Color("#0b1734"), 0);
    this.renderer = renderer;

    this.camera.position.set(0, 2.1, 7);
    this.camera.lookAt(0, 1.8, 0);

    const hemisphere = new HemisphereLight("#dcecff", "#1b2b58", 2.7);
    const key = new DirectionalLight("#ffffff", 3.2);
    key.position.set(3, 5, 4);
    this.scene.add(hemisphere, key);
  }

  attach(avatar: LoadedAvatar): void {
    if (this.avatar) this.releaseAvatar();

    this.avatar = avatar.scene;
    this.animations = avatar.animations;
    this.fitAvatar(this.avatar);
    this.scene.add(this.avatar);
    this.mixer = new AnimationMixer(this.avatar);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  setMotion(motion: AvatarMotionState, reducedMotion: boolean): void {
    if (!this.mixer) return;

    const clipName = motion.kind === "emote" ? motion.clipId : clipFor(motion);
    const clip =
      AnimationClip.findByName(this.animations, clipName) ??
      AnimationClip.findByName(this.animations, "idle_default");
    if (!clip) return;

    const nextAction = this.mixer.clipAction(clip);
    const sameAction = this.action === nextAction;
    if (!sameAction) {
      nextAction.reset();
      nextAction.clampWhenFinished = motion.kind === "emote";
      nextAction.setLoop(
        motion.kind === "emote" ? LoopOnce : LoopRepeat,
        motion.kind === "emote" ? 1 : Infinity,
      );
      nextAction.play();
      this.action?.crossFadeTo(nextAction, CROSS_FADE_SECONDS, false);
      this.action = nextAction;
    }

    const pauseIdle = reducedMotion && motion.kind === "idle";
    nextAction.paused = pauseIdle;
    if (pauseIdle) nextAction.time = 0;
    this.setAnimationLoop(!pauseIdle);
  }

  dispose(): void {
    this.setAnimationLoop(false);
    this.releaseAvatar();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = undefined;
  }

  private readonly tick = (time: number) => {
    const delta =
      this.lastFrameTime === 0
        ? 0
        : Math.min(
            (time - this.lastFrameTime) / 1_000,
            MAX_FRAME_DELTA_SECONDS,
          );
    this.lastFrameTime = time;
    this.mixer?.update(delta);
    this.render();
  };

  private setAnimationLoop(active: boolean): void {
    if (!this.renderer || this.animationLoopActive === active) {
      if (!active) this.render();
      return;
    }
    this.animationLoopActive = active;
    this.lastFrameTime = 0;
    this.renderer.setAnimationLoop(active ? this.tick : null);
    if (!active) this.render();
  }

  private render(): void {
    this.renderer?.render(this.scene, this.camera);
  }

  private fitAvatar(avatar: Object3D): void {
    const initialBounds = new Box3().setFromObject(avatar);
    const size = initialBounds.getSize(new Vector3());
    if (size.y <= 0) throw new Error("avatar has no visible geometry");

    const scale = TARGET_HEIGHT / size.y;
    avatar.scale.multiplyScalar(scale);
    avatar.updateMatrixWorld(true);

    const fittedBounds = new Box3().setFromObject(avatar);
    const center = fittedBounds.getCenter(new Vector3());
    avatar.position.x -= center.x;
    avatar.position.y -= fittedBounds.min.y;
    avatar.position.z -= center.z;
  }

  private releaseAvatar(): void {
    if (!this.avatar) return;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.avatar);
    this.scene.remove(this.avatar);
    disposeObject(this.avatar);
    this.avatar = undefined;
    this.mixer = undefined;
    this.animations = [];
    this.action = undefined;
  }
}

function clipFor(
  motion: Exclude<AvatarMotionState, { kind: "emote" }>,
): string {
  return motion.kind === "idle" ? "idle_default" : motion.kind;
}

function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) disposeMaterial(material);
  });
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}
