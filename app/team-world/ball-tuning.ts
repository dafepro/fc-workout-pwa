import type { WorldMap } from "zmap";

export type BallTuning = { gravity: number; speed: number; friction: number };
const pitchBalls = new Set(["practice-ball", "garden-soccer-ball"]);
const closeSpeedRatio = 2.8 / 6.1;

export function readBallTuning(map: WorldMap): BallTuning {
  const ball = map.toys.find((toy) => toy.id === "practice-ball");
  if (!ball?.strike || ball.gravity === undefined)
    throw Error("Pitch ball is missing");
  return {
    gravity: ball.gravity,
    speed: ball.strike.speed,
    friction: ball.rollingResistance ?? 1,
  };
}

export function applyBallTuning(map: WorldMap, value: BallTuning) {
  if (
    !Number.isFinite(value.gravity) ||
    value.gravity < 3 ||
    value.gravity > 12 ||
    !Number.isFinite(value.speed) ||
    value.speed < 2 ||
    value.speed > 10 ||
    !Number.isFinite(value.friction) ||
    value.friction < 0 ||
    value.friction > 3
  )
    throw Error("Ball tuning is outside the dev control range");
  for (const ball of map.toys) {
    if (!pitchBalls.has(ball.id) || !ball.strike) continue;
    ball.gravity = value.gravity;
    ball.strike.speed = value.speed;
    ball.strike.closeSpeed = value.speed * closeSpeedRatio;
    ball.rollingResistance = value.friction;
  }
}
