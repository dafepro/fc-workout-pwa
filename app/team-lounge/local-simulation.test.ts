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

import { LoungeActionBehavior } from "./lounge-action-behavior";
import { LoungeBallBehavior } from "./lounge-ball-behavior";
import { LoungeCompositeBehavior } from "./lounge-composite-behavior";
import { loungeItemDefinitions } from "./lounge-items";
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

    const seeded = requests.filter(({ type }) => type === "addItem") as {
      instance?: {
        definitionId?: string;
        itemRevision?: number;
        sceneRevision?: number;
      };
    }[];
    expect(seeded.map(({ instance }) => instance?.definitionId)).toEqual([
      "beach-ball",
      "zoomigo-lounge-action-router",
    ]);
    expect(
      seeded.every(
        ({ instance }) =>
          instance?.itemRevision === 1 && instance.sceneRevision === 1,
      ),
    ).toBe(true);
  }, 15_000);

  it("presents the player and lets a direct-drag target move them", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
      ]),
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

  it("lets the ball clear the snack cart instead of trapping it", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
      ]),
      onRender(next) {
        entities = next;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "boardwalk-beach-ball"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 45, y: 98 },
    });
    await until(
      () => (entities.find(({ id }) => id === "avatar:mason")?.y ?? 0) > 96,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 55, y: 98 },
    });
    await until(
      () =>
        (entities.find(({ id }) => id === "boardwalk-beach-ball")?.x ?? 0) > 64,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: false,
    });

    await until(
      () =>
        (entities.find(({ id }) => id === "boardwalk-beach-ball")?.x ?? 0) > 75,
      4_000,
    );
  });

  it("lets the player reach scenery areas where the ball can travel", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
      ]),
      onRender(next) {
        entities = next;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "avatar:mason"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 88, y: 116.5 },
    });

    await until(() => {
      const avatar = entities.find(({ id }) => id === "avatar:mason");
      return (avatar?.x ?? 0) > 84 && (avatar?.y ?? 0) > 112;
    }, 4_000);
  });

  it("turns an off-centre player contact into ball spin", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
      ]),
      onRender(next) {
        entities = next;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "boardwalk-beach-ball"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 50, y: 93 },
    });
    await until(
      () => (entities.find(({ id }) => id === "avatar:mason")?.x ?? 0) > 48,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 59, y: 96 },
    });

    await until(
      () =>
        Math.abs(
          entities.find(({ id }) => id === "boardwalk-beach-ball")
            ?.angularVelocity ?? 0,
        ) > 0.1,
    );
  });

  it("lets the ball move and visibly rotate a dynamic Lounge item", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    const coneDefinition = loungeItemDefinitions.find(
      ({ definitionId }) => definitionId === "zoomigo-prop-play-wobble-cone",
    );
    expect(coneDefinition).toBeDefined();
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
        LoungeCompositeBehavior,
      ]),
      additionalDefinitions: [coneDefinition!],
      additionalItems: [
        {
          entityId: "wobble-cone",
          canvasId: "zoomigo-beach-boardwalk",
          definitionId: coneDefinition!.definitionId,
          definitionVersion: coneDefinition!.version,
          ownerUserId: "mason",
          transform: { x: 76, y: 98, rotation: 0, scale: 1 },
          resolvedConfig: coneDefinition!.defaultConfig,
          createdAt: "2026-08-30T00:00:00.000Z",
          sceneRevision: 1,
          itemRevision: 1,
        },
      ],
      onRender(next) {
        entities = next;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "wobble-cone"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 50, y: 98 },
    });
    await until(
      () => (entities.find(({ id }) => id === "avatar:mason")?.y ?? 0) > 96,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 59, y: 98 },
    });

    await until(() => {
      const cone = entities.find(({ id }) => id === "wobble-cone");
      return (cone?.x ?? 76) > 76.5 && Math.abs(cone?.rotation ?? 0) > 0.04;
    }, 5_000);
  }, 8_000);

  it("holds, scores, and relaunches the system ball through a placed mini goal", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    let sawScoreAndRelaunch = false;
    const goalDefinition = loungeItemDefinitions.find(
      ({ definitionId }) => definitionId === "zoomigo-prop-play-mini-goal",
    );
    expect(goalDefinition).toBeDefined();
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
        LoungeCompositeBehavior,
      ]),
      additionalDefinitions: [goalDefinition!],
      additionalItems: [
        {
          entityId: "mini-goal",
          canvasId: "zoomigo-beach-boardwalk",
          definitionId: goalDefinition!.definitionId,
          definitionVersion: goalDefinition!.version,
          ownerUserId: "mason",
          transform: { x: 75, y: 98, rotation: Math.PI / 2, scale: 1 },
          resolvedConfig: goalDefinition!.defaultConfig,
          createdAt: "2026-08-30T00:00:00.000Z",
          sceneRevision: 1,
          itemRevision: 1,
        },
      ],
      onRender(next) {
        entities = next;
        const goal = next.find(({ id }) => id === "mini-goal");
        const score = (
          goal?.behaviorState as { goalScore?: number } | undefined
        )?.goalScore;
        const ball = next.find(({ id }) => id === "boardwalk-beach-ball");
        sawScoreAndRelaunch ||=
          (score ?? 0) >= 1 && (ball?.x ?? 100) < 68 && (ball?.vx ?? 0) < -1;
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "boardwalk-beach-ball"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 50, y: 98 },
    });
    await until(
      () => (entities.find(({ id }) => id === "avatar:mason")?.y ?? 0) > 96,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 59, y: 98 },
    });
    await until(() => sawScoreAndRelaunch, 4_000);
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const goal = entities.find(({ id }) => id === "mini-goal");
    expect(
      (goal?.behaviorState as { goalScore?: number } | undefined)?.goalScore,
    ).toBe(1);
  }, 8_000);

  it("keeps the ball on the boardwalk and bounces it off the right edge", async () => {
    const { SimulationDriver } = await import("@canvas-physics/client");
    let entities: RenderEntity[] = [];
    let maxBallX = 0;
    let sawRightwardMotion = false;
    let sawLeftwardBounce = false;
    let peakRightwardSpeed = 0;
    let peakLeftwardBounceSpeed = 0;
    const simulation = startLocalBeachBoardwalkSimulation({
      playerID: "mason",
      driver: SimulationDriver.local([
        LoungeBallBehavior,
        LoungeActionBehavior,
      ]),
      onRender(next) {
        entities = next;
        const ball = next.find(({ id }) => id === "boardwalk-beach-ball");
        maxBallX = Math.max(maxBallX, ball?.x ?? 0);
        sawRightwardMotion ||= (ball?.vx ?? 0) > 1;
        sawLeftwardBounce ||= sawRightwardMotion && (ball?.vx ?? 0) < -1;
        peakRightwardSpeed = Math.max(peakRightwardSpeed, ball?.vx ?? 0);
        if (sawRightwardMotion) {
          peakLeftwardBounceSpeed = Math.max(
            peakLeftwardBounceSpeed,
            -(ball?.vx ?? 0),
          );
        }
      },
    });
    stop = simulation.stop;

    await simulation.ready;
    await until(() => entities.some(({ id }) => id === "boardwalk-beach-ball"));
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 45, y: 98 },
    });
    await until(
      () => (entities.find(({ id }) => id === "avatar:mason")?.y ?? 0) > 96,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: true,
      target: { x: 55, y: 98 },
    });
    await until(
      () =>
        (entities.find(({ id }) => id === "boardwalk-beach-ball")?.x ?? 0) > 64,
    );
    simulation.move({
      direction: { x: 0, y: 0 },
      intensity: 0,
      held: false,
    });

    await until(() => {
      const ball = entities.find(({ id }) => id === "boardwalk-beach-ball");
      return maxBallX > 90 && sawLeftwardBounce && (ball?.x ?? 100) < 94;
    }, 7_000);
    expect(maxBallX).toBeLessThanOrEqual(96);
    expect(peakLeftwardBounceSpeed).toBeGreaterThan(peakRightwardSpeed * 0.65);
    expect(
      entities.find(({ id }) => id === "boardwalk-beach-ball")?.respawning,
    ).not.toBe(true);
  }, 10_000);
});

async function until(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  expect(predicate()).toBe(true);
}
