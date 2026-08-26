import type {
  AvatarPointerIntent,
  RenderEntity,
  SimulationDriver,
  SimulationResponse,
} from "@canvas-physics/client";
import type { ItemInstance } from "@canvas-physics/core";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
} from "./scene/beach-boardwalk";

export interface LocalBeachBoardwalkSimulation {
  ready: Promise<void>;
  move(intent: AvatarPointerIntent): void;
  stop(): void;
}

export function startLocalBeachBoardwalkSimulation({
  playerID,
  onRender,
  onError,
  driver,
}: {
  playerID: string;
  onRender(entities: RenderEntity[]): void;
  onError?(message: string): void;
  driver: SimulationDriver;
}): LocalBeachBoardwalkSimulation {
  const generation = 1;
  const avatarID = `avatar:${playerID}`;
  let inputSequence = 0;
  let stopped = false;
  let settleReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    settleReady = resolve;
    rejectReady = reject;
  });

  const unsubscribe = driver.onMessage((message: SimulationResponse) => {
    if (message.generation !== generation || stopped) return;
    if (message.type === "ready") {
      const systemItem = beachBoardwalkCanvas.systemItems[0];
      driver.send({
        type: "addItem",
        instance: systemItemInstance(systemItem),
      });
      settleReady?.();
      settleReady = undefined;
      rejectReady = undefined;
      return;
    }
    if (message.type === "render") {
      onRender(message.entities);
      return;
    }
    if (message.type === "error") {
      onError?.(message.message);
      rejectReady?.(new Error(message.message));
      settleReady = undefined;
      rejectReady = undefined;
    }
  });

  driver.send({
    type: "init",
    generation,
    canvas: beachBoardwalkCanvas,
    definitions: beachBoardwalkDefinitions,
    tickRate: 60,
    isHost: true,
    localAvatar: {
      entityId: avatarID,
      clientId: "zoomigo-local-preview",
      userId: playerID,
      position: beachBoardwalkCanvas.spawnPoints[0].position,
      ...beachBoardwalkCanvas.avatarController,
    },
  });

  return {
    ready,
    move(intent) {
      if (stopped) return;
      driver.send({
        type: "input",
        entityId: avatarID,
        direction: intent.direction,
        intensity: intent.intensity,
        held: intent.held,
        inputSequence: ++inputSequence,
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      driver.terminate();
    },
  };
}

function systemItemInstance(
  item: (typeof beachBoardwalkCanvas.systemItems)[number],
): ItemInstance {
  return {
    entityId: item.entityId,
    canvasId: beachBoardwalkCanvas.id,
    definitionId: item.definitionId,
    definitionVersion: item.definitionVersion,
    ownerUserId: "",
    transform: item.transform,
    resolvedConfig: item.resolvedConfig,
    createdAt: "2026-08-25T00:00:00.000Z",
    sceneRevision: 1,
  };
}
