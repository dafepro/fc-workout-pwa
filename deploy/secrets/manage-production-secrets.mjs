#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FORMAT = "zoomigo-deployment-secrets-v1";
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
export const REQUIRED_FILES = Object.freeze([
  "backup-s3.env",
  "cloudflare.env",
  "deploy.env",
  "deploy_ssh_key",
  "known_hosts",
]);

function fail(message) {
  throw new Error(message);
}

async function requireRegularFile(path, label) {
  let details;
  try {
    details = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing: ${path}`);
    throw error;
  }
  if (!details.isFile() || details.isSymbolicLink()) {
    fail(`${label} must be a regular file: ${path}`);
  }
}

async function requireAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  fail(`${label} already exists: ${path}`);
}

function sameNames(actual) {
  return (
    actual.length === REQUIRED_FILES.length &&
    actual.every((name, index) => name === REQUIRED_FILES[index])
  );
}

function placeholderFiles(files) {
  const patterns = [
    /replace-me/i,
    /example\.com/i,
    /ACCOUNT_ID\.r2/i,
    /BEGIN PLACEHOLDER/i,
  ];
  return files
    .filter(({ data }) => {
      const text = data.toString("utf8");
      return patterns.some((pattern) => pattern.test(text));
    })
    .map(({ name }) => name);
}

export async function packPlaintextDirectory(plaintextDirectory) {
  const entries = await readdir(plaintextDirectory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  if (!sameNames(names) || entries.some((entry) => !entry.isFile())) {
    fail("plaintext directory has an unexpected file layout");
  }

  const files = [];
  for (const name of REQUIRED_FILES) {
    const path = join(plaintextDirectory, name);
    await requireRegularFile(path, name);
    const data = await readFile(path);
    if (data.length === 0 || data.length > MAX_BUNDLE_BYTES) {
      fail(`${name} must be non-empty and smaller than 2 MiB`);
    }
    files.push({ name, data });
  }

  const placeholders = placeholderFiles(files);
  if (placeholders.length > 0) {
    fail(
      `plaintext bundle still contains a placeholder in: ${placeholders.join(" ")}`,
    );
  }

  const serialized = JSON.stringify({
    format: FORMAT,
    files: files.map(({ name, data }) => ({
      name,
      data: data.toString("base64"),
    })),
  });
  return gzipSync(Buffer.from(serialized, "utf8"), { level: 9 });
}

function decodePortableBundle(bundle) {
  if (
    !Buffer.isBuffer(bundle) ||
    bundle.length === 0 ||
    bundle.length > MAX_BUNDLE_BYTES
  ) {
    fail("portable bundle is empty or too large");
  }

  let document;
  try {
    const serialized = gunzipSync(bundle, {
      maxOutputLength: MAX_BUNDLE_BYTES,
    });
    document = JSON.parse(serialized.toString("utf8"));
  } catch {
    fail("portable bundle is corrupt or is not the supported format");
  }
  if (document?.format !== FORMAT || !Array.isArray(document.files)) {
    fail("portable bundle has an unsupported format");
  }

  const names = document.files.map(({ name }) => name);
  if (!sameNames(names)) fail("portable bundle has an unexpected file layout");

  return document.files.map(({ name, data }) => {
    if (
      typeof data !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        data,
      )
    ) {
      fail(`portable bundle contains invalid data for ${name}`);
    }
    const decoded = Buffer.from(data, "base64");
    if (
      decoded.length === 0 ||
      decoded.length > MAX_BUNDLE_BYTES ||
      decoded.toString("base64") !== data
    ) {
      fail(`portable bundle contains invalid data for ${name}`);
    }
    return { name, data: decoded };
  });
}

export async function unpackPortableBundle(bundle, outputDirectory) {
  const files = decodePortableBundle(bundle);
  await requireAbsent(outputDirectory, "output directory");
  await mkdir(outputDirectory, { mode: 0o700 });
  try {
    await chmod(outputDirectory, 0o700);
    for (const { name, data } of files) {
      const path = join(outputDirectory, name);
      await writeFile(path, data, { flag: "wx", mode: 0o600 });
      await chmod(path, 0o600);
    }
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function validateRecipients(recipientsFile) {
  await requireRegularFile(recipientsFile, "recipient file");
  const contents = await readFile(recipientsFile, "utf8");
  if (/replace|example|placeholder/i.test(contents)) {
    fail("recipient file still contains a placeholder");
  }
  const recipients = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (
    recipients.length < 2 ||
    recipients.some((line) => !/^age1[0-9a-z]+$/.test(line))
  ) {
    fail(
      "recipient file must contain separate operator and CI age X25519 recipients",
    );
  }
}

function deployHostFrom(contents) {
  const line = contents
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("DEPLOY_HOST="));
  if (!line) fail("deploy.env is missing DEPLOY_HOST");
  let value = line.slice("DEPLOY_HOST=".length).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    value = value.slice(1, -1);
  }
  if (!/^[A-Za-z0-9.-]+$/.test(value))
    fail("deploy.env has an invalid DEPLOY_HOST");
  return value;
}

function run(command, args, failureMessage) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error?.code === "ENOENT") fail(`${command} is required`);
  if (result.error || result.status !== 0) fail(failureMessage);
}

async function validateSshFiles(plaintextDirectory, temporaryDirectory) {
  const deployHost = deployHostFrom(
    await readFile(join(plaintextDirectory, "deploy.env"), "utf8"),
  );
  const privateKey = join(temporaryDirectory, "deploy_ssh_key");
  await writeFile(
    privateKey,
    await readFile(join(plaintextDirectory, "deploy_ssh_key")),
    {
      mode: 0o600,
    },
  );
  await chmod(privateKey, 0o600);
  run(
    "ssh-keygen",
    ["-y", "-P", "", "-f", privateKey],
    "deploy_ssh_key must be a valid passphrase-free SSH private key",
  );
  run(
    "ssh-keygen",
    ["-F", deployHost, "-f", join(plaintextDirectory, "known_hosts")],
    `known_hosts has no verified entry for DEPLOY_HOST (${deployHost})`,
  );
}

export async function sealProductionBundle(
  plaintextDirectory,
  recipientsFile,
  outputFile,
) {
  await validateRecipients(recipientsFile);
  await requireAbsent(outputFile, "encrypted production bundle");
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "zoomigo-secret-seal-"),
  );
  const temporaryBundle = join(temporaryDirectory, "portable-bundle.gz");
  const temporaryOutput = join(
    dirname(outputFile),
    `.${basename(outputFile)}.tmp-${process.pid}-${randomUUID()}`,
  );
  try {
    const bundle = await packPlaintextDirectory(plaintextDirectory);
    await validateSshFiles(plaintextDirectory, temporaryDirectory);
    await writeFile(temporaryBundle, bundle, { mode: 0o600 });
    run(
      "age",
      [
        "--encrypt",
        "-R",
        recipientsFile,
        "-o",
        temporaryOutput,
        temporaryBundle,
      ],
      "age could not encrypt the production bundle",
    );
    await chmod(temporaryOutput, 0o600);
    await rename(temporaryOutput, outputFile);
    console.log(
      `Sealed the portable production deployment bundle at ${outputFile}.`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    await rm(temporaryOutput, { force: true });
  }
}

export async function openProductionBundle(
  identityFile,
  bundleFile,
  outputDirectory,
) {
  await requireRegularFile(identityFile, "age identity file");
  await requireRegularFile(bundleFile, "encrypted production bundle");
  await requireAbsent(outputDirectory, "output directory");
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "zoomigo-secret-open-"),
  );
  const decryptedBundle = join(temporaryDirectory, "portable-bundle.gz");
  try {
    run(
      "age",
      ["--decrypt", "-i", identityFile, "-o", decryptedBundle, bundleFile],
      "age could not decrypt the production bundle",
    );
    await unpackPortableBundle(
      await readFile(decryptedBundle),
      outputDirectory,
    );
    console.log(
      `Opened the portable production bundle into ${outputDirectory}.`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "seal") {
    await sealProductionBundle(
      resolve(args[0] ?? join(SCRIPT_DIRECTORY, "plaintext")),
      resolve(args[1] ?? join(SCRIPT_DIRECTORY, "production-recipients.txt")),
      resolve(args[2] ?? join(SCRIPT_DIRECTORY, "production.tar.gz.age")),
    );
    return;
  }
  if (command === "open") {
    if (!args[0])
      fail(
        "usage: manage-production-secrets.mjs open IDENTITY_FILE [BUNDLE] [OUTPUT_DIRECTORY]",
      );
    await openProductionBundle(
      resolve(args[0]),
      resolve(args[1] ?? join(SCRIPT_DIRECTORY, "production.tar.gz.age")),
      resolve(args[2] ?? join(SCRIPT_DIRECTORY, "opened")),
    );
    return;
  }
  fail(
    "usage: manage-production-secrets.mjs seal [PLAINTEXT RECIPIENTS OUTPUT] | open IDENTITY [BUNDLE OUTPUT]",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}
