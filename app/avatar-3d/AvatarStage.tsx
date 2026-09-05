"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";

import { avatar3dCopy } from "./copy";
import type { AvatarLoadout, AvatarMotionState } from "./types";
import styles from "./AvatarStage.module.css";
import { AvatarRuntime } from "./runtime/AvatarRuntime";
import { AvatarAssembler } from "./runtime/AvatarAssembler";
import {
  AvatarLibraryLoader,
  HttpAvatarCatalogLoader,
} from "./runtime/AvatarLibraryLoader";
import { ThreeAvatarAssetLoader } from "./runtime/ThreeAvatarAssetLoader";
import { ThreeAvatarBackend } from "./runtime/ThreeAvatarBackend";
import type { AvatarRuntimeState } from "./runtime/types";

interface AvatarStageStartOptions {
  catalogURL: string;
  loadout: AvatarLoadout;
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

export interface AvatarStageRuntime {
  start(options: AvatarStageStartOptions): Promise<void>;
  resize(width: number, height: number, pixelRatio: number): void;
  setMotion(motion: AvatarMotionState): void;
  setLoadout(loadout: AvatarLoadout): Promise<void>;
  setReducedMotion(reducedMotion: boolean): void;
  dispose(): void;
}

export type AvatarStageRuntimeFactory = (
  onState: (state: AvatarRuntimeState) => void,
) => AvatarStageRuntime;

interface AvatarStageProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  catalogURL: string;
  loadout: AvatarLoadout;
  motion: AvatarMotionState;
  runtimeFactory?: AvatarStageRuntimeFactory;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const createRuntime: AvatarStageRuntimeFactory = (onState) =>
  new AvatarRuntime({
    backend: new ThreeAvatarBackend(),
    loader: new AvatarLibraryLoader(
      new HttpAvatarCatalogLoader(),
      new AvatarAssembler(new ThreeAvatarAssetLoader()),
    ),
    onState,
  });

export function AvatarStage({
  catalogURL,
  loadout,
  motion,
  runtimeFactory = createRuntime,
  className,
  ...props
}: AvatarStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousLoadoutRef = useRef(loadout);
  const runtimeRef = useRef<AvatarStageRuntime | undefined>(undefined);
  const [runtimeState, setRuntimeState] = useState<AvatarRuntimeState>({
    kind: "loading",
  });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let active = true;
    const runtime = runtimeFactory((state) => {
      if (active) setRuntimeState(state);
    });
    const initialReducedMotion = readReducedMotion();
    setReducedMotion(initialReducedMotion);
    runtimeRef.current = runtime;
    void runtime.start({
      catalogURL,
      loadout: previousLoadoutRef.current,
      canvas,
      reducedMotion: initialReducedMotion,
    });

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      runtime.resize(bounds.width, bounds.height, window.devicePixelRatio);
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(resize);
    observer?.observe(stage);
    resize();

    return () => {
      active = false;
      observer?.disconnect();
      if (runtimeRef.current === runtime) runtimeRef.current = undefined;
      runtime.dispose();
    };
  }, [catalogURL, runtimeFactory]);

  useEffect(() => {
    if (previousLoadoutRef.current === loadout) return;
    previousLoadoutRef.current = loadout;
    void runtimeRef.current?.setLoadout(loadout);
  }, [loadout]);

  useEffect(() => {
    runtimeRef.current?.setMotion(motion);
  }, [motion]);

  useEffect(() => {
    const media = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!media) return;
    const handleChange = ({ matches }: MediaQueryListEvent) => {
      setReducedMotion(matches);
      runtimeRef.current?.setReducedMotion(matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const unavailable = runtimeState.kind === "unavailable";

  return (
    <div
      ref={stageRef}
      {...props}
      className={[styles.stage, className].filter(Boolean).join(" ")}
      data-avatar-state={runtimeState.kind}
      data-avatar-items={
        runtimeState.kind === "ready"
          ? runtimeState.equippedItemIDs.join(" ")
          : undefined
      }
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-testid="avatar-3d-canvas"
        aria-hidden="true"
        hidden={unavailable}
      />
      {unavailable ? (
        <span
          className={styles.fallback}
          aria-label={avatar3dCopy.fallbackLabel}
        >
          Z
        </span>
      ) : null}
      <p className={styles.status} role="status" aria-live="polite">
        {statusCopy(runtimeState)}
      </p>
      {reducedMotion ? (
        <p className={styles.motionPreference}>{avatar3dCopy.reducedMotion}</p>
      ) : null}
    </div>
  );
}

function readReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function statusCopy(state: AvatarRuntimeState): string {
  if (state.kind === "ready") return avatar3dCopy.ready;
  if (state.kind === "unavailable") return avatar3dCopy.unavailable;
  return avatar3dCopy.loading;
}
