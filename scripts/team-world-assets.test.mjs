import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createWorldManifest,
  prepareWorldAssets,
  verifyWorldManifest,
  worldAssetSources,
} from "./team-world-assets.mjs";

const root = new URL("../", import.meta.url);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "zoomigo-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = pathToFileURL(directory + "/");
  const paths = new Set(
    worldAssetSources.flatMap((f) => [f.source, f.provenance]),
  );
  for (const path of paths) {
    const target = new URL(path, base);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await cp(new URL(path, root), target);
  }
  await writeFile(
    new URL("assets/team-world/manifest.json", base),
    JSON.stringify(await createWorldManifest(base)),
  );
  return base;
}

test("source or collision drift cannot replace an already packaged release", async (t) => {
  for (const role of ["campus", "collision"]) {
    const base = await fixture(t);
    const target = new URL("public/team-world-assets/keep", base);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, "previous release");
    const source = new URL(
      worldAssetSources.find((f) => f.role === role).source,
      base,
    );
    const bytes = await readFile(source);
    if (role === "collision") {
      const map = JSON.parse(bytes);
      map.spawn.x += 1;
      await writeFile(source, JSON.stringify(map));
    } else {
      bytes[bytes.length - 1] ^= 1;
      await writeFile(source, bytes);
    }
    await assert.rejects(prepareWorldAssets(base), /manifest differs/i);
    assert.equal(await readFile(target, "utf8"), "previous release");
  }
});

test("provenance drift requires explicit manifest regeneration", async (t) => {
  const base = await fixture(t);
  await writeFile(
    new URL(worldAssetSources[0].provenance, base),
    "Changed provenance",
  );
  await assert.rejects(verifyWorldManifest(base), /manifest differs/i);
});

test("valid packaging copies only the five declared runtime GLBs and its exact manifest", async (t) => {
  const base = await fixture(t);
  const old = new URL("public/team-world-assets/campus-v2/stale.glb", base);
  await mkdir(new URL("./", old), { recursive: true });
  await writeFile(old, "stale");
  const manifest = await prepareWorldAssets(base);
  const folder = new URL(
    `public/team-world-assets/app-${manifest.releaseDigest}/`,
    base,
  );
  assert.deepEqual(
    (await readdir(new URL("public/team-world-assets/", base))).sort(),
    [`app-${manifest.releaseDigest}`],
  );
  assert.deepEqual(
    (await readdir(folder)).sort(),
    [
      "asset-manifest.json",
      ...manifest.files.flatMap((f) => (f.publicName ? [f.publicName] : [])),
    ].sort(),
  );
  for (const entry of manifest.files.filter((f) => f.publicName))
    assert.deepEqual(
      await readFile(new URL(entry.publicName, folder)),
      await readFile(new URL(entry.source, base)),
    );
  assert.deepEqual(
    JSON.parse(await readFile(new URL("asset-manifest.json", folder))),
    manifest,
  );
});

test("manifest cannot substitute unreviewed paths or relax caps", async (t) => {
  const base = await fixture(t);
  const file = new URL("assets/team-world/manifest.json", base);
  const manifest = JSON.parse(await readFile(file));
  manifest.files[1].source =
    "assets/team-world/campus/models/pitch-goal-v2.glb";
  manifest.files[1].limits.bytes *= 2;
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyWorldManifest(base), /manifest differs/i);
});

test("external GLB payloads cannot be blessed by regeneration", async (t) => {
  for (const kind of ["buffer", "image"]) {
    const base = await fixture(t);
    const file = new URL(worldAssetSources[1].source, base);
    const bytes = await readFile(file);
    const end = 20 + bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, end));
    if (kind === "buffer")
      json.buffers[0].uri = "https://unreviewed.example/model.bin";
    else json.images[0].uri = "https://unreviewed.example/texture.jpg";
    const raw = Buffer.from(JSON.stringify(json));
    const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20);
    raw.copy(padded);
    const header = Buffer.from(bytes.subarray(0, 20));
    header.writeUInt32LE(20 + padded.length + bytes.length - end, 8);
    header.writeUInt32LE(padded.length, 12);
    await writeFile(file, Buffer.concat([header, padded, bytes.subarray(end)]));
    await assert.rejects(
      createWorldManifest(base),
      /embed every buffer and image/,
    );
  }
});
