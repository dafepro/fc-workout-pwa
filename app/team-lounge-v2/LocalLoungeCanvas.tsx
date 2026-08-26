"use client";

import { useEffect, useRef } from "react";
import type { AvatarPointerIntent, RenderEntity } from "@canvas-physics/client";
import { startLocalBeachBoardwalkSimulation } from "./local-simulation";
import { beachBoardwalkAssets } from "./scene/assets";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
} from "./scene/beach-boardwalk";

export type LocalLoungeCanvasState =
  | "loading"
  | "ready"
  | "static-preview"
  | "error";

export function LocalLoungeCanvas({
  playerID,
  reducedMotion,
  onStateChange,
}: {
  playerID: string;
  reducedMotion: boolean;
  onStateChange(state: LocalLoungeCanvasState): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerNameRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (typeof Worker === "undefined") {
      onStateChange("static-preview");
      return;
    }

    let disposed = false;
    let dispose = () => undefined;
    onStateChange("loading");

    void (async () => {
      const {
        AvatarPointerInteraction,
        KeyboardController,
        PixiScene,
        PointerInteractionCoordinator,
        SimulationDriver,
        pixiAssetLoader,
        preloadAssetManifest,
      } = await import("@canvas-physics/client");
      if (disposed) return;

      const assets = await preloadAssetManifest(beachBoardwalkAssets, {
        adapter: pixiAssetLoader,
      });
      if (disposed) return;

      const scene = new PixiScene(
        beachBoardwalkCanvas,
        beachBoardwalkDefinitions,
        { background: 0x63c9dc, resolution: Math.min(devicePixelRatio, 2) },
        assets,
      );
      await scene.mount(mount);
      if (disposed) {
        scene.destroy();
        return;
      }

      const movement = new AvatarPointerInteraction({
        mode: "thumbstick",
        deadZonePx: 5,
        fullRangePx: 62,
        flick: reducedMotion
          ? false
          : {
              sampleWindowMs: 100,
              minimumSpeedPxPerSecond: 320,
              fullSpeedPxPerSecond: 1_250,
            },
      });
      const pointer = new PointerInteractionCoordinator(mount, {
        strategies: [movement],
      });
      const keyboard = new KeyboardController(window);
      const driver = SimulationDriver.spawn();
      let entities: RenderEntity[] = [];
      let lastFrameAt = performance.now();
      let lastIntent = "";
      let frame = 0;
      const simulation = startLocalBeachBoardwalkSimulation({
        playerID,
        driver,
        onRender(next) {
          entities = next;
        },
        onError() {
          if (!disposed) onStateChange("error");
        },
      });

      await simulation.ready;
      if (disposed) {
        simulation.stop();
        pointer.destroy();
        keyboard.destroy();
        scene.destroy();
        return;
      }

      const draw = (now: number) => {
        const deltaMs = Math.min(50, Math.max(0, now - lastFrameAt));
        lastFrameAt = now;
        scene.update(entities, deltaMs);
        scene.setThumbstick(movement.gesture);
        const intent = activeIntent(movement.intent, keyboard.intent);
        const serialized = intentKey(intent);
        if (serialized !== lastIntent) {
          lastIntent = serialized;
          simulation.move(intent);
        }
        positionName(scene, entities, playerID, playerNameRef.current);
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
      onStateChange("ready");

      dispose = () => {
        cancelAnimationFrame(frame);
        simulation.stop();
        pointer.destroy();
        keyboard.destroy();
        scene.destroy();
      };
    })().catch(() => {
      if (!disposed) onStateChange("error");
    });

    return () => {
      disposed = true;
      dispose();
    };
  }, [onStateChange, playerID, reducedMotion]);

  return (
    <>
      <div
        ref={mountRef}
        className="team-lounge-v2__stage"
        aria-label="Interactive lounge canvas"
        tabIndex={0}
      />
      <div className="team-lounge-v2__avatar-fallback" aria-hidden="true">
        <span>{playerID.slice(0, 1).toUpperCase()}</span>
      </div>
      <p ref={playerNameRef} className="team-lounge-v2__player-name">
        You
      </p>
    </>
  );
}

function activeIntent(
  pointer: AvatarPointerIntent,
  keyboard: AvatarPointerIntent,
) {
  return pointer.held || pointer.intensity > 0 ? pointer : keyboard;
}

function intentKey(intent: AvatarPointerIntent) {
  return [
    intent.direction.x.toFixed(3),
    intent.direction.y.toFixed(3),
    intent.intensity.toFixed(3),
    intent.held ? "1" : "0",
  ].join(":");
}

function positionName(
  scene: {
    camera: {
      toScreenX(value: number): number;
      toScreenY(value: number): number;
    };
  },
  entities: RenderEntity[],
  playerID: string,
  label: HTMLParagraphElement | null,
) {
  if (!label) return;
  const avatar = entities.find(({ id }) => id === `avatar:${playerID}`);
  label.hidden = !avatar;
  if (!avatar) return;
  label.style.transform = `translate3d(${scene.camera.toScreenX(avatar.x)}px, ${scene.camera.toScreenY(avatar.y) - 30}px, 0) translateX(-50%)`;
}
