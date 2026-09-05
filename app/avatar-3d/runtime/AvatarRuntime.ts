import type { AvatarMotionState } from "../types";
import type {
  AvatarAssetLoader,
  AvatarRenderBackend,
  AvatarRuntimeState,
} from "./types";

interface AvatarRuntimeOptions {
  backend: AvatarRenderBackend;
  loader: AvatarAssetLoader;
  onState: (state: AvatarRuntimeState) => void;
}

interface AvatarRuntimeStartOptions {
  assetURL: string;
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

export class AvatarRuntime {
  private disposed = false;
  private reducedMotion = false;
  private motion: AvatarMotionState = { kind: "idle" };

  constructor(private readonly options: AvatarRuntimeOptions) {}

  async start({
    assetURL,
    canvas,
    reducedMotion,
  }: AvatarRuntimeStartOptions): Promise<void> {
    this.reducedMotion = reducedMotion;
    this.options.onState({ kind: "loading" });

    try {
      await this.options.backend.initialize(canvas);
    } catch {
      this.fail("renderer-init-failed");
      return;
    }

    try {
      const avatar = await this.options.loader.load(assetURL);
      if (this.disposed) return;
      this.options.backend.attach(avatar);
      this.options.backend.setMotion(this.motion, this.reducedMotion);
      this.options.onState({
        kind: "ready",
        animationNames: avatar.animations.map(({ name }) => name),
      });
    } catch {
      this.fail("asset-load-failed");
    }
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed) return;
    this.options.backend.resize(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
      Math.min(2, Math.max(1, pixelRatio)),
    );
  }

  setMotion(motion: AvatarMotionState): void {
    if (this.disposed) return;
    this.motion = motion;
    this.options.backend.setMotion(motion, this.reducedMotion);
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.disposed || this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    this.options.backend.setMotion(this.motion, this.reducedMotion);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.options.backend.dispose();
  }

  private fail(
    reason: Extract<AvatarRuntimeState, { kind: "unavailable" }>["reason"],
  ) {
    this.dispose();
    this.options.onState({ kind: "unavailable", reason });
  }
}
