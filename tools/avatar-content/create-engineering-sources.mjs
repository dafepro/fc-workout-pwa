import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { createArtwork } from "./lib/avatar-art.mjs";
import { exportGLB } from "./lib/glb.mjs";

const projectRoot = process.cwd();
const sourceRoot = resolve(projectRoot, "content/avatar/source");
const library = JSON.parse(
  await readFile(
    resolve(projectRoot, "content/avatar/engineering-library.json"),
    "utf8",
  ),
);

for (const item of library.items) {
  const outputPath = resolve(projectRoot, item.source);
  assertInsideSourceRoot(outputPath);
  const { scene, animations = [] } = createArtwork(item);
  const bytes = await exportGLB(scene, animations);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
}

console.log(`Authored ${library.items.length} source GLBs in ${sourceRoot}`);

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
