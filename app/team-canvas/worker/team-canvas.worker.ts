/// <reference lib="webworker" />

import type { PhysicsVector, TeamCanvasPhysicsFrame } from "../physics";
import { ClientPhysicsWorld } from "./engine";

type WorkerInput =
  | { type: "init"; frame: TeamCanvasPhysicsFrame; host: boolean }
  | { type: "avatar"; playerId: string; position: PhysicsVector; at: number }
  | { type: "reconcile"; frame: TeamCanvasPhysicsFrame }
  | {
      type: "piece.transform";
      id: string;
      transform: { x: number; y: number; size: number; rotation: number };
    }
  | { type: "host"; host: boolean };

let world: ClientPhysicsWorld | null = null;
let host = false;
let frameTicks = 0;

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const message = event.data;
  if (message.type === "init") {
    world = new ClientPhysicsWorld(message.frame);
    host = message.host;
  } else if (message.type === "avatar") {
    world?.moveAvatar(message.playerId, message.position, message.at);
  } else if (message.type === "reconcile") {
    world?.reconcile(message.frame, true);
  } else if (message.type === "piece.transform") {
    world?.transformBody(message.id, message.transform);
  } else if (message.type === "host") {
    host = message.host;
  }
};

setInterval(() => {
  if (!world) return;
  world.step(1 / 60);
  frameTicks++;
  if (frameTicks % 2 === 0) {
    self.postMessage({ type: "frame", frame: world.frame() });
  }
  if (host && frameTicks % 6 === 0) {
    self.postMessage({ type: "host.snapshot", frame: world.frame() });
  }
}, 1000 / 60);

export {};
