import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderEntity } from "@canvas-physics/client";

import { startLocalBeachBoardwalkSimulation } from "./local-simulation";

let stop: (() => void) | undefined;

afterEach(() => stop?.());

describe("canonical local Lounge simulation", () => {
  it("presents the player and lets a direct-drag target move them", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const { SimulationDriver } = await import("@canvas-physics/client");
    getContext.mockRestore();
    let entities: RenderEntity[] = [];
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local(),
      onRender(next) {
        entities = next;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "avatar:mason"));
    expect(entities.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["avatar:mason", "boardwalk-beach-ball"]),
    );
    const starting = entities.find(({ id }) => id === "avatar:mason")!;
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: starting.x + 15, y: starting.y },
    });
    await until(
      () =>
        (entities.find(({ id }) => id === "avatar:mason")?.x ?? starting.x) >
        starting.x + 0.5,
    );
  });
});

async function until(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  expect(predicate()).toBe(true);
}
