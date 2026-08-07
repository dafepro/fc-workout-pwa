#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backendConfigArgs } from "./provision.mjs";

const INFRASTRUCTURE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(INFRASTRUCTURE_DIRECTORY, "../..");
const KNOWN_HOSTS_FILE = join(REPOSITORY_ROOT, "infra/known_hosts");

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

export function fingerprintFrom(output) {
  const matches = output.match(/SHA256:[A-Za-z0-9+/]+/g) ?? [];
  if (matches.length !== 1)
    fail("could not determine exactly one ED25519 host fingerprint");
  return matches[0];
}

function deployHost() {
  command("tofu", ["init", "-input=false", ...backendConfigArgs(process.env)], {
    cwd: INFRASTRUCTURE_DIRECTORY,
    failure: "could not initialize the Terraform state backend",
  });
  const host = command("tofu", ["output", "-raw", "deploy_host"], {
    cwd: INFRASTRUCTURE_DIRECTORY,
    failure: "could not read deploy_host from Terraform state",
  });
  if (!isIpv4(host)) fail("Terraform returned an invalid deploy_host");
  return host;
}

async function main() {
  const [flag, expectedFingerprint] = process.argv.slice(2);
  if (flag !== "--expected-fingerprint" || !expectedFingerprint) {
    fail("usage: adopt-host.sh --expected-fingerprint SHA256:...");
  }
  if (!/^SHA256:[A-Za-z0-9+/]+$/.test(expectedFingerprint)) {
    fail("expected-fingerprint must be an SHA256 SSH fingerprint");
  }

  const host = deployHost();
  const scan = command("ssh-keyscan", ["-T", "10", "-t", "ed25519", host], {
    failure: "ssh-keyscan could not retrieve the host ED25519 key",
  });
  const keyLines = scan
    .split(/\r?\n/)
    .filter(
      (line) => line && !line.startsWith("#") && line.includes(" ssh-ed25519 "),
    );
  if (keyLines.length !== 1)
    fail("ssh-keyscan did not return exactly one ED25519 key");

  const candidateKnownHosts = join(
    INFRASTRUCTURE_DIRECTORY,
    `.known_hosts.candidate-${process.pid}`,
  );
  let observedFingerprint;
  try {
    await writeFile(candidateKnownHosts, `${keyLines[0]}\n`, { mode: 0o600 });
    observedFingerprint = fingerprintFrom(
      command("ssh-keygen", ["-E", "sha256", "-lf", candidateKnownHosts], {
        failure: "ssh-keygen could not fingerprint the candidate host key",
      }),
    );
  } finally {
    command("rm", ["-f", candidateKnownHosts], { failure: "cleanup failed" });
  }
  if (observedFingerprint !== expectedFingerprint) {
    fail(`host fingerprint mismatch: observed ${observedFingerprint}`);
  }

  await writeFile(KNOWN_HOSTS_FILE, `${keyLines[0]}\n`, { mode: 0o644 });
  command(
    "gh",
    ["variable", "set", "DEPLOY_HOST", "--env", "production", "--body", host],
    { failure: "gh variable set could not update DEPLOY_HOST" },
  );
  console.log(
    `Pinned ${host} with verified fingerprint ${observedFingerprint}.`,
  );
  console.log(
    "infra/known_hosts changed and DEPLOY_HOST was updated; commit and push infra/known_hosts.",
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
