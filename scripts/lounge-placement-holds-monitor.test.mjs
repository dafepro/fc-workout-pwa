import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const script = resolve(
  import.meta.dirname,
  "lounge-placement-holds-monitor.mjs",
);

test("the Lounge monitor passes non-stale operational holds", async () => {
  const { stdout } = await runMonitor({
    totalHeld: 3,
    expiredPermits: 1,
    awaitingCanvas: 2,
    staleCanvasOutcomes: 0,
    totalItemMutations: 4,
    expiredItemPermits: 1,
    awaitingItemOutcomes: 3,
    staleItemOutcomes: 0,
  });
  assert.match(stdout, /no stale Canvas outcomes/);
});

test("the Lounge monitor alerts on stale placement or edit outcomes", async () => {
  for (const stale of [
    { staleCanvasOutcomes: 1, staleItemOutcomes: 0 },
    { staleCanvasOutcomes: 0, staleItemOutcomes: 2 },
  ]) {
    await assert.rejects(
      runMonitor({
        totalHeld: 1,
        expiredPermits: 0,
        awaitingCanvas: 1,
        totalItemMutations: 2,
        expiredItemPermits: 0,
        awaitingItemOutcomes: 2,
        ...stale,
      }),
      (error) => {
        assert.equal(error.code, 2);
        assert.match(error.stderr, /stale Canvas outcomes require review/);
        return true;
      },
    );
  }
});

test("the Lounge monitor fails closed on malformed report data", async () => {
  await assert.rejects(runMonitor({ staleCanvasOutcomes: 0 }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /invalid Lounge placement hold report/);
    return true;
  });
});

test("the scheduled workflow is read-only and uses the production host boundary", async () => {
  const workflow = await readFile(
    resolve(
      import.meta.dirname,
      "../.github/workflows/lounge-placement-holds.yml",
    ),
    "utf8",
  );
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /lounge-placement-holds --stale-after 24h/);
  assert.match(workflow, /lounge-placement-holds-monitor\.mjs/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /UserKnownHostsFile=infra\/known_hosts/);
  assert.doesNotMatch(workflow, /refund|release-hold|UPDATE|DELETE FROM/i);
});

function runMonitor(report) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else
        rejectRun(Object.assign(new Error(stderr), { code, stdout, stderr }));
    });
    child.stdin.end(JSON.stringify(report));
  });
}
