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
  assert.ok(
    (await read("../../pnpm-lock.yaml")).includes(
      `integrity: ${installed.integrity},`,
    ),
  );
});
