import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDrills } from "./drill-result.mjs";

const partial = {
  container: "success",
  releaseCandidate: "success",
  host: "skipped",
  fullRequested: true,
  hostRequested: false,
  hostEnabled: false,
};

test("successful requested subsets pass without claiming full qualification", () => {
  for (const input of [
    partial,
    { ...partial, fullRequested: false, releaseCandidate: "skipped" },
  ]) {
    const result = evaluateDrills(input);
    assert.equal(result.passed, true);
    assert.equal(result.complete, false);
    assert.match(result.summary, /Full automated qualification is incomplete/);
  }
});

test("failed, cancelled, skipped or unknown requested jobs fail", () => {
  for (const status of ["failure", "cancelled", "skipped", "unknown"]) {
    assert.equal(
      evaluateDrills({ ...partial, container: status }).passed,
      false,
    );
    assert.equal(
      evaluateDrills({ ...partial, releaseCandidate: status }).passed,
      false,
    );
    assert.equal(
      evaluateDrills({
        ...partial,
        hostRequested: true,
        hostEnabled: true,
        host: status,
      }).passed,
      false,
    );
  }
});

test("requested but disabled host checks fail explicitly", () => {
  const result = evaluateDrills({ ...partial, hostRequested: true });
  assert.equal(result.passed, false);
  assert.match(result.summary, /disabled by PRODUCTION_DRILLS_ENABLED/);
});

test("all successful checks prove automated mechanics only", () => {
  const result = evaluateDrills({
    ...partial,
    hostRequested: true,
    hostEnabled: true,
    host: "success",
  });
  assert.equal(result.passed, true);
  assert.equal(result.complete, true);
  assert.match(result.summary, /Full automated qualification passed/);
  assert.match(result.summary, /Alert delivery, timed real-archive restore/);
});
