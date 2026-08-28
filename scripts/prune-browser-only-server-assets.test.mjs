import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pruneBrowserOnlyServerAssets } from "./prune-browser-only-server-assets.mjs";

test("removes unreferenced worker copies from the server module upload", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-worker-prune-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const clientAssets = join(root, "client", "assets");
  const serverAssets = join(root, "server", "ssr", "assets");
  await mkdir(clientAssets, { recursive: true });
  await mkdir(serverAssets, { recursive: true });
  await writeFile(join(clientAssets, "canvas.worker-abc.js"), "browser worker");
  await writeFile(join(serverAssets, "canvas.worker-abc.js"), "browser worker");
  await writeFile(join(serverAssets, "page.js"), 'import "./shared.js";');
  await writeFile(
    join(serverAssets, "shared.js"),
    "export const shared = true;",
  );

  const removed = await pruneBrowserOnlyServerAssets(root);

  assert.deepEqual(removed, ["ssr/assets/canvas.worker-abc.js"]);
  await assert.rejects(readFile(join(serverAssets, "canvas.worker-abc.js")));
  assert.equal(
    await readFile(join(serverAssets, "shared.js"), "utf8"),
    "export const shared = true;",
  );
});

test("keeps a worker module when another server module references it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-worker-prune-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const clientAssets = join(root, "client", "assets");
  const serverAssets = join(root, "server", "ssr", "assets");
  await mkdir(clientAssets, { recursive: true });
  await mkdir(serverAssets, { recursive: true });
  await writeFile(join(clientAssets, "canvas.worker-abc.js"), "browser worker");
  await writeFile(join(serverAssets, "canvas.worker-abc.js"), "browser worker");
  await writeFile(
    join(serverAssets, "page.js"),
    'import "./canvas.worker-abc.js";',
  );

  const removed = await pruneBrowserOnlyServerAssets(root);

  assert.deepEqual(removed, []);
  assert.equal(
    await readFile(join(serverAssets, "canvas.worker-abc.js"), "utf8"),
    "browser worker",
  );
});
