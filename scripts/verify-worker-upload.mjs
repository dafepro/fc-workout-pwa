import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_COMPRESSED_UPLOAD_KIB = 2800;

export function parseCompressedUploadKiB(output) {
  const match = output.match(/Total Upload:.*?\/ gzip:\s*([\d.]+)\s*KiB/);
  if (!match)
    throw new Error("Wrangler did not report a compressed upload size.");
  return Number(match[1]);
}

export function assertWorkerUploadFits(compressedKiB) {
  if (compressedKiB > MAX_COMPRESSED_UPLOAD_KIB) {
    throw new Error(
      `Compressed Worker upload ${compressedKiB} KiB exceeds the ${MAX_COMPRESSED_UPLOAD_KIB} KiB delivery budget.`,
    );
  }
}

export function verifyWorkerUpload() {
  const outputDirectory = mkdtempSync(
    resolve(tmpdir(), "zoomigo-worker-upload-"),
  );
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [
        resolve("node_modules/wrangler/bin/wrangler.js"),
        "deploy",
        "--config",
        "dist/server/wrangler.json",
        "--dry-run",
        "--outdir",
        outputDirectory,
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Wrangler dry run exited with status ${result.status}.`);
  }
  const compressedKiB = parseCompressedUploadKiB(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
  assertWorkerUploadFits(compressedKiB);
  console.log(
    `Worker upload is ${compressedKiB} KiB compressed (${MAX_COMPRESSED_UPLOAD_KIB} KiB budget).`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    verifyWorkerUpload();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
