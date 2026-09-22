import {
  bodyAt,
  idleInput,
  initialSimulation,
  stepWorld,
  type WorldMap,
} from "zmap/core";

/** Real shared simulation snapshots for the animation review, with no relay or mocks. */
export function aerialSimulation(
  kind: "header" | "bicycle",
  moving: boolean,
  floor: number,
) {
  const map: WorldMap = {
    version: 1,
    id: "aerial-review",
    bounds: { x: -50, z: -50, width: 100, depth: 100 },
    spawn: { x: 0, y: floor, z: 0 },
    kickWindup: 0.2,
    surfaces: [
      {
        id: "floor",
        x: -50,
        z: -50,
        width: 100,
        depth: 100,
        y: floor,
        thickness: 0.2,
      },
    ],
    blockers: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    toys: [
      {
        id: "review-ball",
        home: {
          x: 0.3,
          y: floor + (kind === "header" ? 2.16 : 3.06),
          z: moving ? 1.72 : 0.6,
        },
        radius: 0.3,
        color: "#fff",
        sleep: "home",
        strike: { speed: 6.1, closeLift: 5.8 },
        restitution: 0.5,
        rollingResistance: 1,
      },
    ],
  };
  const state = initialSimulation(map);
  state.players.motion = bodyAt(map.spawn);
  const frames = [];
  for (let tick = 0; tick <= 50; tick++) {
    stepWorld(map, state, {
      motion: {
        ...idleInput(),
        z: moving ? 1 : 0,
        sprint: moving,
        kick: tick === 0,
      },
    });
    frames.push(structuredClone(state));
  }
  return { map, frames };
}
