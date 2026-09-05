import type { AvatarLoadout, AvatarMotionState } from "../types";
import type {
  AvatarPresentationLoader,
  AvatarRenderBackend,
  AvatarRuntimeState,
} from "./types";

interface AvatarRuntimeOptions {
  backend: AvatarRenderBackend;
  loader: AvatarPresentationLoader;
  onState: (state: AvatarRuntimeState) => void;
}

export interface AvatarRuntimeStartOptions {
  catalogURL: string;
  loadout: AvatarLoadout;
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

export class AvatarRuntime {
  private disposed = false;
  private reducedMotion = false;
  private motion: AvatarMotionState = { kind: "idle" };
  private source?: { catalogURL: string; loadout: AvatarLoadout };
  private loadGeneration = 0;

  constructor(private readonly options: AvatarRuntimeOptions) {}

  async start({
    catalogURL,
    loadout,
    canvas,
    reducedMotion,
  }: AvatarRuntimeStartOptions): Promise<void> {
    this.reducedMotion = reducedMotion;
    this.source = { catalogURL, loadout };
    this.options.onState({ kind: "loading" });

    try {
      await this.options.backend.initialize(canvas);
    } catch {
      this.fail("renderer-init-failed");
      return;
    }

    await this.loadAvatar(this.source);
  }

  async setLoadout(loadout: AvatarLoadout): Promise<void> {
    if (this.disposed || !this.source) return;
    this.source = { ...this.source, loadout };
    await this.loadAvatar(this.source);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed) return;
    this.options.backend.resize(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
      Math.min(2, Math.max(1, pixelRatio)),
    );
  }

  setView(rotationRadians: number): void {
    if (this.disposed || !Number.isFinite(rotationRadians)) return;
    this.options.backend.setView(rotationRadians);
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

  private async loadAvatar(source: {
    catalogURL: string;
    loadout: AvatarLoadout;
  }): Promise<void> {
    const generation = ++this.loadGeneration;
    try {
      const avatar = await this.options.loader.load(source);
      if (this.disposed || generation !== this.loadGeneration) return;
      this.options.backend.attach(avatar);
      this.options.backend.setMotion(this.motion, this.reducedMotion);
      this.options.onState({
        kind: "ready",
        animationNames: avatar.animations.map(({ name }) => name),
        equippedItemIDs: avatar.equippedItemIDs,
        warnings: avatar.warnings,
      });
    } catch {
      if (generation === this.loadGeneration) this.fail("asset-load-failed");
    }
  }
}
