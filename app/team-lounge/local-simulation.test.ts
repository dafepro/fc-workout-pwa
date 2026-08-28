import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { RenderEntity } from "@canvas-physics/client";

import { startLocalBeachBoardwalkSimulation } from "./local-simulation";

let stop: (() => void) | undefined;
let getContext: { mockRestore(): void };

beforeAll(() => {
  getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(null);
});

afterEach(() => stop?.());
afterAll(() => getContext.mockRestore());

describe("canonical local Lounge simulation", () => {
  it("seeds system items with the current revisioned Canvas contract", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    const requests: Array<{ type: string; [key: string]: unknown }> = [];
    const driver = new SimulationDriver((post) => ({
      send(request) {
        requests.push(request);
        if (request.type === "init") {
          queueMicrotask(() =>
            post({ type: "ready", generation: request.generation }),
          );
        }
      },
      terminate() {},
    }));
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver,
      onRender() {},
    });
    stop = simulation.stop;

    await simulation.ready;

    const seeded = requests.find(({ type }) => type === "addItem") as {
      instance?: { itemRevision?: number; sceneRevision?: number };
    };
    expect(seeded.instance).toMatchObject({
      itemRevision: 1,
      sceneRevision: 1,
    });
  });

  it("presents the player and lets a direct-drag target move them", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
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
