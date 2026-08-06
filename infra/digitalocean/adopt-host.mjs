#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  openProductionBundle,
  sealProductionBundle,
} from "../../deploy/secrets/manage-production-secrets.mjs";

const INFRASTRUCTURE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(INFRASTRUCTURE_DIRECTORY, "../..");
const PRODUCTION_BUNDLE = join(
  REPOSITORY_ROOT,
  "deploy/secrets/production.tar.gz.age",
);
const RECIPIENTS_FILE = join(
  REPOSITORY_ROOT,
  "deploy/secrets/production-recipients.txt",
);
const ENCRYPTED_STATE_FILE = join(
  INFRASTRUCTURE_DIRECTORY,
  "terraform.tfstate.age",
);

function fail(message) {
  throw new Error(message);
}

function isIpv4(value) {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every(
      (octet) =>
        /^\d{1,3}$/.test(octet) &&
        Number(octet) <= 255 &&
        (octet === "0" || !octet.startsWith("0")),
    )
  );
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error?.code === "ENOENT") fail(`${commandName} is required`);
  if (result.error || result.status !== 0) {
    fail(
      `${options.failure ?? commandName + " failed"}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function updateDeployHost(contents, host) {
  if (!isIpv4(host)) fail("deploy host must be an IPv4 address");
  const lines = contents.split(/\r?\n/);
  let replacements = 0;
  const changed = lines.map((line) => {
    if (!line.startsWith("DEPLOY_HOST=")) return line;
    replacements += 1;
    return `DEPLOY_HOST='${host}'`;
  });
  if (replacements !== 1)
    fail("deploy.env must contain exactly one DEPLOY_HOST assignment");
  return changed.join("\n");
}

export function fingerprintFrom(output) {
  const matches = output.match(/SHA256:[A-Za-z0-9+/]+/g) ?? [];
  if (matches.length !== 1)
    fail("could not determine exactly one ED25519 host fingerprint");
  return matches[0];
}

async function replaceAtomically(source, destination) {
  const backup = `${destination}.previous-${process.pid}`;
  await rename(destination, backup);
  try {
    await rename(source, destination);
    await rm(backup, { force: true });
  } catch (error) {
    if (!(await exists(destination))) await rename(backup, destination);
    throw error;
  }
}

async function deployHost(identityFile, temporaryDirectory) {
  if (!(await exists(ENCRYPTED_STATE_FILE))) {
    fail("encrypted Terraform state is missing; run provision.sh apply first");
  }
  const stateFile = join(temporaryDirectory, "terraform.tfstate");
  command(
    "age",
    ["--decrypt", "-i", identityFile, "-o", stateFile, ENCRYPTED_STATE_FILE],
    { failure: "could not decrypt Terraform state" },
  );
  await chmod(stateFile, 0o600);
  const host = command(
    "tofu",
    ["output", `-state=${stateFile}`, "-raw", "deploy_host"],
    {
      cwd: INFRASTRUCTURE_DIRECTORY,
      failure: "could not read deploy_host from Terraform state",
    },
  );
  if (!isIpv4(host)) fail("Terraform returned an invalid deploy_host");
  return host;
}

async function main() {
  const [identityArgument, flag, expectedFingerprint] = process.argv.slice(2);
  if (
    !identityArgument ||
    flag !== "--expected-fingerprint" ||
    !expectedFingerprint
  ) {
    fail(
      "usage: adopt-host.sh IDENTITY_FILE --expected-fingerprint SHA256:...",
    );
  }
  if (!/^SHA256:[A-Za-z0-9+/]+$/.test(expectedFingerprint)) {
    fail("expected-fingerprint must be an SHA256 SSH fingerprint");
  }

  const identityFile = resolve(identityArgument);
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "zoomigo-host-adoption-"),
  );
  const openedDirectory = join(temporaryDirectory, "secrets");
  const candidateKnownHosts = join(temporaryDirectory, "known_hosts");
  const nextBundle = join(
    dirname(PRODUCTION_BUNDLE),
    `.production.tar.gz.age.next-${process.pid}`,
  );
  try {
    const host = await deployHost(identityFile, temporaryDirectory);
    const scan = command("ssh-keyscan", ["-T", "10", "-t", "ed25519", host], {
      failure: "ssh-keyscan could not retrieve the host ED25519 key",
    });
    const keyLines = scan
      .split(/\r?\n/)
      .filter(
        (line) =>
          line && !line.startsWith("#") && line.includes(" ssh-ed25519 "),
      );
    if (keyLines.length !== 1)
      fail("ssh-keyscan did not return exactly one ED25519 key");
    await writeFile(candidateKnownHosts, `${keyLines[0]}\n`, { mode: 0o600 });
    const observedFingerprint = fingerprintFrom(
      command("ssh-keygen", ["-E", "sha256", "-lf", candidateKnownHosts], {
        failure: "ssh-keygen could not fingerprint the candidate host key",
      }),
    );
    if (observedFingerprint !== expectedFingerprint) {
      fail(`host fingerprint mismatch: observed ${observedFingerprint}`);
    }

    await openProductionBundle(
      identityFile,
      PRODUCTION_BUNDLE,
      openedDirectory,
    );
    const deployEnvironmentPath = join(openedDirectory, "deploy.env");
    await writeFile(
      deployEnvironmentPath,
      updateDeployHost(await readFile(deployEnvironmentPath, "utf8"), host),
      { mode: 0o600 },
    );
    await writeFile(join(openedDirectory, "known_hosts"), `${keyLines[0]}\n`, {
      mode: 0o600,
    });
    await sealProductionBundle(openedDirectory, RECIPIENTS_FILE, nextBundle);
    await replaceAtomically(nextBundle, PRODUCTION_BUNDLE);
    console.log(
      `Pinned ${host} with verified fingerprint ${observedFingerprint}.`,
    );
    console.log(
      "The encrypted production bundle changed; commit it before release.",
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    await rm(nextBundle, { force: true });
  }
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
