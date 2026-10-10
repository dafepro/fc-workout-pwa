import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("browser and isolated relay ship the same reviewed ZMap artifact", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const root = JSON.parse(await read("../../package.json"));
  const relay = JSON.parse(await read("./package.json"));
  const lock = JSON.parse(await read("./package-lock.json"));
  assert.equal(relay.dependencies.zmap, root.dependencies.zmap);
  assert.equal(lock.packages[""].dependencies.zmap, root.dependencies.zmap);
  const installed = lock.packages["node_modules/zmap"];
  assert.equal(installed.resolved, root.dependencies.zmap);
  const entry = (await read("../../pnpm-lock.yaml"))
    .split(`  zmap@${installed.resolved}:`)[1]
    .split("\n\n")[0];
  assert.ok(entry.includes(`integrity: ${installed.integrity},`));
  assert.equal(
    entry.match(/\n    version: (.+)/)?.[1].trim(),
    installed.version,
  );
});
