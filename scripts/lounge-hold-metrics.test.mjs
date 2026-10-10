import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const collector = resolve(
  import.meta.dirname,
  "../deploy/vm/scripts/write-lounge-hold-metrics.py",
);
const report = {
  totalHeld: 3,
  expiredPermits: 1,
  awaitingCanvas: 2,
  staleCanvasOutcomes: 1,
  totalItemMutations: 4,
  expiredItemPermits: 1,
  awaitingItemOutcomes: 3,
  staleItemOutcomes: 2,
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-hold-metrics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const metrics = join(root, "textfile");
  await mkdir(metrics);
  const envFile = join(root, "app.env");
  await writeFile(envFile, "APP_ENV=production\n");
  await writeFile(join(root, "report.json"), JSON.stringify(report));
  await writeFile(
    join(root, "docker"),
    `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(process.env.TEST_ARGUMENTS, JSON.stringify(process.argv.slice(2)));
if (process.env.TEST_FAILURE) {
  process.stderr.write('private-player-id credential=private-secret');
  process.exit(1);
}
if (process.env.TEST_TIMEOUT) {
  setTimeout(() => process.exit(0), 45000);
} else {
process.stdout.write(fs.readFileSync(process.env.TEST_REPORT));
}
`,
    { mode: 0o755 },
  );
  return {
    root,
    metrics,
    run(extraEnv = {}) {
      return spawnSync("python3", [collector, metrics, envFile], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          TEST_ARGUMENTS: join(root, "arguments.json"),
          TEST_REPORT: join(root, "report.json"),
          ...extraEnv,
        },
      });
    },
  };
}

test("host collection exports only bounded aggregates, including stale outcomes", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.root, "report.json"),
    JSON.stringify({
      ...report,
      playerId: "private-player-id",
      oldestHeldAt: "2026-10-01T00:00:00Z",
    }),
  );
  const before = Math.floor(Date.now() / 1000);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const text = await readFile(
    join(f.metrics, "zoomigo_lounge_holds.prom"),
    "utf8",
  );
  assert.match(text, /zoomigo_lounge_stale_canvas_outcomes 1\n/);
  assert.match(text, /zoomigo_lounge_stale_item_outcomes 2\n/);
  assert.match(text, /zoomigo_lounge_total_held 3\n/);
  assert.doesNotMatch(
    text + result.stdout + result.stderr,
    /private-player-id|2026-10-01|playerId/,
  );
  const timestamp = Number(
    text.match(
      /zoomigo_lounge_holds_last_success_timestamp_seconds (\d+)/,
    )?.[1],
  );
  assert.ok(timestamp >= before && timestamp <= Math.floor(Date.now() / 1000));
  assert.match(
    await readFile(
      join(f.metrics, "zoomigo_lounge_holds_collection.prom"),
      "utf8",
    ),
    /zoomigo_lounge_holds_collection_success 1\n/,
  );
  assert.equal(
    (await stat(join(f.metrics, "zoomigo_lounge_holds.prom"))).mode & 0o777,
    0o600,
  );
  const args = JSON.parse(
    await readFile(join(f.root, "arguments.json"), "utf8"),
  );
  assert.deepEqual(args.slice(-10), [
    "--profile",
    "operations",
    "run",
    "--rm",
    "--no-TTY",
    "--no-deps",
    "admin",
    "lounge-placement-holds",
    "--stale-after",
    "24h",
  ]);
});

test("failed collection preserves last successful counts and freshness without leaking diagnostics", async (t) => {
  const f = await fixture(t);
  assert.equal(f.run().status, 0);
  const previous = await readFile(
    join(f.metrics, "zoomigo_lounge_holds.prom"),
    "utf8",
  );
  const result = f.run({ TEST_FAILURE: "1" });
  assert.equal(result.status, 1);
  assert.equal(
    await readFile(join(f.metrics, "zoomigo_lounge_holds.prom"), "utf8"),
    previous,
  );
  assert.match(
    await readFile(
      join(f.metrics, "zoomigo_lounge_holds_collection.prom"),
      "utf8",
    ),
    /zoomigo_lounge_holds_collection_success 0\n/,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /private-player-id|private-secret/,
  );
});

test("invalid initial reports never publish reassuring zero counts", async (t) => {
  const f = await fixture(t);
  for (const value of [
    "invalid json",
    "{}",
    "[]",
    JSON.stringify({ ...report, totalHeld: -1 }),
    JSON.stringify({ ...report, totalHeld: true }),
    JSON.stringify({ ...report, totalHeld: 1.5 }),
    JSON.stringify({ ...report, totalHeld: Number.MAX_SAFE_INTEGER + 1 }),
  ]) {
    await writeFile(join(f.root, "report.json"), value);
    const result = f.run();
    assert.equal(result.status, 1);
    await assert.rejects(stat(join(f.metrics, "zoomigo_lounge_holds.prom")), {
      code: "ENOENT",
    });
    assert.match(
      await readFile(
        join(f.metrics, "zoomigo_lounge_holds_collection.prom"),
        "utf8",
      ),
      /zoomigo_lounge_holds_collection_success 0\n/,
    );
  }
});

test(
  "a hung report is bounded and records collection failure",
  { timeout: 35000 },
  async (t) => {
    const f = await fixture(t);
    const started = Date.now();
    const result = f.run({ TEST_TIMEOUT: "1" });
    assert.equal(result.status, 1);
    assert.ok(Date.now() - started < 34000);
    assert.match(
      await readFile(
        join(f.metrics, "zoomigo_lounge_holds_collection.prom"),
        "utf8",
      ),
      /zoomigo_lounge_holds_collection_success 0\n/,
    );
    await assert.rejects(stat(join(f.metrics, "zoomigo_lounge_holds.prom")), {
      code: "ENOENT",
    });
  },
);
