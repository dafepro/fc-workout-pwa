import assert from "node:assert/strict";
import test from "node:test";
import { verifyBrowserReport } from "./verify-browser-report.mjs";

const passing = {
  stats: { expected: 8, skipped: 0, unexpected: 0, flaky: 0 },
  errors: [],
};
test("accepts an executed clean browser run", () => {
  assert.equal(verifyBrowserReport(passing), 8);
});
test("rejects skipped, empty, malformed, interrupted, failed and flaky runs", () => {
  for (const report of [
    {},
    { stats: {} },
    { ...passing, stats: { ...passing.stats, expected: 0 } },
    { ...passing, stats: { ...passing.stats, expected: "8" } },
    { ...passing, stats: { ...passing.stats, skipped: 1 } },
    { ...passing, stats: { ...passing.stats, unexpected: 1 } },
    { ...passing, stats: { ...passing.stats, flaky: 1 } },
    { ...passing, errors: [{ message: "interrupted" }] },
  ])
    assert.throws(() => verifyBrowserReport(report), /requires executed/);
});
