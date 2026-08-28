import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export async function pruneBrowserOnlyServerAssets(distRoot) {
  const clientRoot = join(distRoot, "client");
  const serverRoot = join(distRoot, "server");
  const [clientFiles, serverFiles] = await Promise.all([
    filesBelow(clientRoot),
    filesBelow(serverRoot),
  ]);
  const clientWorkers = new Map(
    clientFiles.filter(isWorkerChunk).map((path) => [basename(path), path]),
  );
  const serverModules = serverFiles.filter((path) => /\.[cm]?js$/.test(path));
  const serverSources = new Map(
    await Promise.all(
      serverModules.map(async (path) => [path, await readFile(path, "utf8")]),
    ),
  );
  const removed = [];

  for (const serverPath of serverModules.filter(isWorkerChunk)) {
    const clientPath = clientWorkers.get(basename(serverPath));
    if (!clientPath || !(await filesMatch(clientPath, serverPath))) continue;
    const referenced = anyModuleReferences(
      [...serverSources.entries()].filter(([path]) => path !== serverPath),
      basename(serverPath),
    );
    if (referenced) continue;
    await rm(serverPath);
    removed.push(relative(serverRoot, serverPath).split(sep).join("/"));
  }

  return removed.sort();
}

async function filesBelow(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function isWorkerChunk(path) {
  return /(?:^|[\\/])[^\\/]*worker-[^\\/]+\.js$/.test(path);
}

async function filesMatch(left, right) {
  const [leftContents, rightContents] = await Promise.all([
    readFile(left),
    readFile(right),
  ]);
  return leftContents.equals(rightContents);
}

function anyModuleReferences(modules, fileName) {
  for (const [, source] of modules) {
    if (source.includes(fileName)) return true;
  }
  return false;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const removed = await pruneBrowserOnlyServerAssets(resolve("dist"));
  console.log(
    removed.length > 0
      ? `Removed browser-only copies from the server upload: ${removed.join(", ")}`
      : "No unreferenced browser-worker copies found in the server upload.",
  );
}
