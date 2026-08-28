"use client";

import { useEffect, useRef } from "react";
import type { AvatarPointerIntent, RenderEntity } from "@canvas-physics/client";

import { PlayerAvatar } from "../components/PlayerAvatar";
import type { Player } from "../domain/types";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import { startLocalBeachBoardwalkSimulation } from "./local-simulation";
import { beachBoardwalkAssets } from "./scene/assets";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
} from "./scene/beach-boardwalk";

export type LoungeCanvasState = "loading" | "ready" | "static" | "error";

export function LocalLoungeCanvas({
  player,
  onStateChange,
}: {
  player: Player;
  onStateChange(state: LoungeCanvasState): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const playerNameRef = useRef<HTMLParagraphElement>(null);
  const playerID = player.id;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (typeof Worker === "undefined") {
      onStateChange("static");
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
        cssPointToRenderer,
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

      let entities: RenderEntity[] = [];
      const movement = new AvatarPointerInteraction({
        mode: "avatarDrag",
        deadZonePx: 2,
        grabRadiusPx: 36,
        flick: false,
        avatarPosition: () =>
          avatarCssPosition(scene, entities, playerID, mount),
      });
      const pointer = new PointerInteractionCoordinator(mount, {
        strategies: [movement],
      });
      const keyboard = new KeyboardController(window);
      const driver = SimulationDriver.spawn();
      let lastFrameAt = performance.now();
      let lastIntent = "";
      let frame = 0;
      const simulation = startLocalBeachBoardwalkSimulation({
        playerID,
        driver,
        onRender(next) {
          entities = next;
          const ball = next.find(({ id }) => id === loungeBallEntityID);
          publishLoungeBallPosition(
            mount,
            ball ? { x: ball.x, y: ball.y } : undefined,
          );
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
        const intent = worldIntent(
          movement.intent.held || movement.intent.intensity > 0
            ? movement.intent
            : keyboard.intent,
          scene,
          mount,
          cssPointToRenderer,
        );
        const serialized = intentKey(intent);
        if (serialized !== lastIntent) {
          lastIntent = serialized;
          simulation.move(intent);
        }
        positionPlayer(
          avatarCssPosition(scene, entities, playerID, mount),
          avatarRef.current,
          playerNameRef.current,
        );
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
  }, [onStateChange, playerID]);

  return (
    <>
      <div
        ref={mountRef}
        className="team-lounge__stage"
        aria-label="Interactive lounge canvas"
        tabIndex={0}
      />
      <div ref={avatarRef} className="team-lounge__avatar-fallback">
        <PlayerAvatar player={player} size="medium" />
      </div>
      <p ref={playerNameRef} className="team-lounge__player-name">
        You
      </p>
    </>
  );
}

function intentKey(intent: AvatarPointerIntent) {
  return [
    intent.direction.x.toFixed(3),
    intent.direction.y.toFixed(3),
    intent.intensity.toFixed(3),
    intent.held ? "1" : "0",
    intent.target?.x.toFixed(3) ?? "",
    intent.target?.y.toFixed(3) ?? "",
  ].join(":");
}

function worldIntent(
  intent: AvatarPointerIntent,
  scene: {
    app: {
      canvas: HTMLCanvasElement;
      renderer: { width: number; height: number };
    };
    camera: { toWorld(x: number, y: number): { x: number; y: number } };
  },
  mount: HTMLDivElement,
  toRenderer: (
    point: Readonly<{ x: number; y: number }>,
    rendererSize: Readonly<{ width: number; height: number }>,
    cssSize: Readonly<{ width: number; height: number }>,
  ) => Readonly<{ x: number; y: number }>,
): AvatarPointerIntent {
  if (!intent.target) return intent;
  const rect = scene.app.canvas.getBoundingClientRect();
  const target = toRenderer(intent.target, scene.app.renderer, {
    width: rect.width || mount.clientWidth,
    height: rect.height || mount.clientHeight,
  });
  return { ...intent, target: scene.camera.toWorld(target.x, target.y) };
}

function avatarCssPosition(
  scene: {
    app: {
      canvas: HTMLCanvasElement;
      renderer: { width: number; height: number };
    };
    camera: {
      toScreenX(value: number): number;
      toScreenY(value: number): number;
    };
  },
  entities: RenderEntity[],
  playerID: string,
  mount: HTMLDivElement,
) {
  const avatar = entities.find(({ id }) => id === `avatar:${playerID}`);
  if (!avatar) return undefined;
  const rect = scene.app.canvas.getBoundingClientRect();
  const width = rect.width || mount.clientWidth;
  const height = rect.height || mount.clientHeight;
  return {
    x:
      scene.camera.toScreenX(avatar.x) *
      (scene.app.renderer.width > 0 ? width / scene.app.renderer.width : 1),
    y:
      scene.camera.toScreenY(avatar.y) *
      (scene.app.renderer.height > 0 ? height / scene.app.renderer.height : 1),
  };
}

function positionPlayer(
  position: { x: number; y: number } | undefined,
  avatar: HTMLDivElement | null,
  label: HTMLParagraphElement | null,
) {
  if (avatar) {
    avatar.hidden = !position;
    if (position) {
      avatar.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
    }
  }
  if (label) {
    label.hidden = !position;
    if (position) {
      label.style.transform = `translate3d(${position.x}px, ${position.y - 32}px, 0) translateX(-50%)`;
    }
  }
}
