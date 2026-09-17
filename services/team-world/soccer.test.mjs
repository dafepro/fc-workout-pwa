import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSimulation,
  stepWorld,
  validSimulation,
  validateMap,
} from "zmap/core";
import { cannonBehavior, switchBehavior } from "zmap";
import { soccerBehavior } from "../../app/team-world/soccer.mjs";
import map from "../../app/team-world/world.json" with { type: "json" };
const behaviors = [cannonBehavior, switchBehavior, soccerBehavior];
function setup() {
  validateMap(map, behaviors);
  const state = initialSimulation(map, behaviors);
  const pitch = map.objects.find((o) => o.behavior === "soccer");
  const ball = state.toys[pitch.config.ball];
  const score = state.objects.instances[pitch.id];
  const step = (n = 1) => {
    for (let i = 0; i < n; i++)
      stepWorld(map, state, {}, [], [], [], behaviors);
  };
  return { state, pitch, ball, score, step };
}
test("a swept goal counts once, holds, dissolves, returns to midfield and rearms", () => {
  const { state, pitch, ball, score, step } = setup();
  ball.x = pitch.position.x + pitch.config.halfLength - 0.5;
  ball.vx = 30;
  ball.vy = 0;
  step(3);
  assert.equal(score.burgundy, 1);
  assert.equal(score.gold, 0);
  assert.equal(score.phase, "goal");
  const captured = ball.x;
  step(25);
  assert.equal(ball.x, captured);
  assert.equal(score.burgundy, 1);
  const restored = structuredClone(state);
  for (let i = 0; i < 50; i++) {
    step();
    stepWorld(map, restored, {}, [], [], [], behaviors);
  }
  assert.deepEqual(state, restored);
  assert.equal(score.phase, "play");
  assert.ok(Math.abs(ball.x - pitch.position.x) < 1e-8);
  assert.ok(Math.abs(ball.z - pitch.position.z) < 1e-8);
  assert.ok(ball.teleportEpoch > 0);
  assert.ok(validSimulation(state, map, [], behaviors));
  ball.x = pitch.position.x - pitch.config.halfLength + 0.5;
  ball.vx = -30;
  step(3);
  assert.equal(score.gold, 1);
  assert.equal(score.burgundy, 1);
});
test("high and wide shots never score and every published ball stays inside its pitch", () => {
  const { pitch, ball, score, step } = setup();
  for (const [z, y] of [
    [4, 0],
    [0, 3],
  ]) {
    Object.assign(ball, {
      x: pitch.position.x + pitch.config.halfLength - 0.4,
      z: pitch.position.z + z,
      y,
      vx: 35,
      vy: 0,
      vz: 0,
    });
    step(5);
    assert.equal(score.burgundy, 0);
    assert.ok(
      ball.x <= pitch.position.x + pitch.config.halfLength - ballRadius(),
    );
  }
  for (let i = 0; i < 300; i++) {
    Object.assign(ball, { vx: Math.sin(i) * 35, vz: Math.cos(i) * 35, vy: 8 });
    step();
    assert.ok(
      Math.abs(ball.z - pitch.position.z) <=
        pitch.config.halfWidth - ballRadius() + 1e-6,
    );
    assert.ok(
      Math.abs(ball.x - pitch.position.x) <=
        pitch.config.halfLength + 1.75 - ballRadius() + 1e-6,
    );
  }
  function ballRadius() {
    return map.toys.find((t) => t.id === pitch.config.ball).radius;
  }
});
test("malformed score and phase checkpoints are rejected", () => {
  const { state, score } = setup();
  score.burgundy = -1;
  assert.equal(validSimulation(state, map, [], behaviors), false);
  score.burgundy = 0;
  score.phase = "arbitrary";
  assert.equal(validSimulation(state, map, [], behaviors), false);
});
