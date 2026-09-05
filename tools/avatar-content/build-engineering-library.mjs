import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { format } from "prettier";

const projectRoot = process.cwd();
const sourceRoot = resolve(projectRoot, "content/avatar/source");
const assetDirectory = resolve(projectRoot, "public/avatar/assets");
const catalogPath = resolve(
  projectRoot,
  "public/avatar/catalog/avatar-catalog.engineering.json",
);
const library = JSON.parse(
  await readFile(
    resolve(projectRoot, "content/avatar/engineering-library.json"),
    "utf8",
  ),
);
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

await MeshoptEncoder.ready;
await mkdir(assetDirectory, { recursive: true });
const items = [];
const emittedAssets = new Set();
for (const definition of library.items) {
  const sourcePath = resolve(projectRoot, definition.source);
  assertInsideSourceRoot(sourcePath);
  const document = await io.read(sourcePath);
  await document.transform(
    dedup(),
    prune({ keepLeaves: true }),
    resample(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const bytes = await io.writeBinary(document);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const filename = `${hash}.glb`;
  emittedAssets.add(filename);
  await writeFile(resolve(assetDirectory, filename), bytes);

  const item = { ...definition };
  delete item.source;
  delete item.art;
  items.push({
    ...item,
    rigVersion: library.rigVersion,
    assets: {
      lod0: {
        url: `/avatar/assets/${filename}`,
        sha256: hash,
        bytes: bytes.byteLength,
      },
    },
  });
}

for (const filename of await readdir(assetDirectory)) {
  if (/^[a-f0-9]{64}\.glb$/u.test(filename) && !emittedAssets.has(filename)) {
    await unlink(resolve(assetDirectory, filename));
  }
}

const catalog = {
  schemaVersion: library.schemaVersion,
  catalogVersion: library.catalogVersion,
  rigVersion: library.rigVersion,
  colors: library.colors,
  items,
};
await mkdir(dirname(catalogPath), { recursive: true });
await writeFile(
  catalogPath,
  await format(JSON.stringify(catalog), { parser: "json" }),
);
console.log(`Built ${items.length} optimized avatar assets and ${catalogPath}`);

function assertInsideSourceRoot(path) {
  const pathFromRoot = relative(sourceRoot, path);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    resolve(sourceRoot, pathFromRoot) !== path
  ) {
    throw new Error(`Avatar source path escapes ${sourceRoot}`);
  }
}
