import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderEntity } from "@canvas-physics/client";
import { startLocalBeachBoardwalkSimulation } from "./local-simulation";

let stop: (() => void) | undefined;

afterEach(() => stop?.());

describe("local Beach Boardwalk simulation", () => {
  it("presents one avatar and the room-owned beach ball, then moves locally", async () => {
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

    const startingX = entities.find(({ id }) => id === "avatar:mason")!.x;
    simulation.move({ direction: { x: 1, y: 0 }, intensity: 1, held: true });
    await until(
      () =>
        (entities.find(({ id }) => id === "avatar:mason")?.x ?? startingX) >
        startingX + 0.5,
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
