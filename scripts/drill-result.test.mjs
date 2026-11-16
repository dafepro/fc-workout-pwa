import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDrills } from "./drill-result.mjs";

const partial = {
  container: "success",
  releaseCandidate: "success",
  fullRequested: true,
};

test("successful requested source checks report where live-host qualification runs", () => {
  for (const input of [
    partial,
    { ...partial, fullRequested: false, releaseCandidate: "skipped" },
  ]) {
    const result = evaluateDrills(input);
    assert.equal(result.passed, true);
    assert.match(
      result.summary,
      /Live-host qualification runs in dafepro\/deploy/,
    );
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
  }
});
