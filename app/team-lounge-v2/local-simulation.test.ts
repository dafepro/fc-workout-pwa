import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderEntity } from "@canvas-physics/client";
import { startLocalBeachBoardwalkSimulation } from "./local-simulation";

let stop: (() => void) | undefined;

afterEach(() => stop?.());

describe("local Beach Boardwalk simulation", () => {
  it("presents one avatar and lets a direct-drag target move it locally", async () => {
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

    const startingAvatar = entities.find(({ id }) => id === "avatar:mason")!;
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: startingAvatar.x + 15, y: startingAvatar.y },
    });
    await until(
      () =>
        (entities.find(({ id }) => id === "avatar:mason")?.x ??
          startingAvatar.x) >
        startingAvatar.x + 0.5,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: false,
    });
  });
});

async function until(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  expect(predicate()).toBe(true);
}
