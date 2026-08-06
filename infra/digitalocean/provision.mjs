#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { openProductionBundle } from "../../deploy/secrets/manage-production-secrets.mjs";

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
const PRODUCTION_CONFIG = join(REPOSITORY_ROOT, "deploy/production.json");
const STATE_FILE = join(INFRASTRUCTURE_DIRECTORY, "terraform.tfstate");
const ENCRYPTED_STATE_FILE = `${STATE_FILE}.age`;
const PLAN_FILE = join(INFRASTRUCTURE_DIRECTORY, "zoomigo.tfplan");
const PLAN_SHA_FILE = `${PLAN_FILE}.sha`;

function fail(message) {
  throw new Error(message);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") fail(`${commandName} is required`);
  if (result.error || result.status !== 0) {
    const detail = options.capture ? result.stderr.trim() : "";
    fail(
      `${options.failure ?? commandName + " failed"}${detail ? `: ${detail}` : ""}`,
    );
  }
  return options.capture ? result.stdout.trim() : "";
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

export function parseEnvironment(contents) {
  const environment = {};
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) fail(`invalid environment assignment on line ${index + 1}`);
    const [, name, rawValue] = match;
    if (Object.hasOwn(environment, name))
      fail(`duplicate environment variable ${name}`);
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    if (!value || /[\r\n\0]/.test(value)) fail(`invalid value for ${name}`);
    environment[name] = value;
  }
  return environment;
}

async function replaceAtomically(source, destination) {
  const backup = `${destination}.previous-${process.pid}`;
  const hadDestination = await exists(destination);
  if (hadDestination) await rename(destination, backup);
  try {
    await rename(source, destination);
    if (hadDestination) await rm(backup, { force: true });
  } catch (error) {
    if (hadDestination && !(await exists(destination))) {
      await rename(backup, destination);
    }
    throw error;
  }
}

async function restoreState(identityFile) {
  if (await exists(STATE_FILE)) {
    fail(
      "plaintext terraform.tfstate already exists; move it aside before continuing",
    );
  }
  if (!(await exists(ENCRYPTED_STATE_FILE))) return null;
  command(
    "age",
    ["--decrypt", "-i", identityFile, "-o", STATE_FILE, ENCRYPTED_STATE_FILE],
    {
      cwd: INFRASTRUCTURE_DIRECTORY,
      failure: "could not decrypt Terraform state",
    },
  );
  await chmod(STATE_FILE, 0o600);
  return createHash("sha256")
    .update(await readFile(STATE_FILE))
    .digest("hex");
}

async function persistState(originalHash) {
  if (!(await exists(STATE_FILE))) return;
  const currentHash = createHash("sha256")
    .update(await readFile(STATE_FILE))
    .digest("hex");
  if (
    originalHash &&
    originalHash === currentHash &&
    (await exists(ENCRYPTED_STATE_FILE))
  ) {
    await rm(STATE_FILE, { force: true });
    await rm(`${STATE_FILE}.backup`, { force: true });
    return;
  }
  const temporaryState = `${ENCRYPTED_STATE_FILE}.next-${process.pid}`;
  try {
    command(
      "age",
      ["--encrypt", "-R", RECIPIENTS_FILE, "-o", temporaryState, STATE_FILE],
      {
        cwd: INFRASTRUCTURE_DIRECTORY,
        failure: "could not encrypt Terraform state",
      },
    );
    await chmod(temporaryState, 0o600);
    await replaceAtomically(temporaryState, ENCRYPTED_STATE_FILE);
    await rm(STATE_FILE, { force: true });
    await rm(`${STATE_FILE}.backup`, { force: true });
  } finally {
    await rm(temporaryState, { force: true });
  }
}

function releaseSha() {
  return command("git", ["rev-parse", "HEAD"], {
    capture: true,
    failure: "could not determine the release revision",
  });
}

function assertReviewableRelease(sha, allowStateChange = false) {
  const changed = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { capture: true, failure: "could not inspect the worktree" },
  );
  const changedPaths = changed
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const allowedStatePath = "infra/digitalocean/terraform.tfstate.age";
  if (
    changedPaths.some((path) => !allowStateChange || path !== allowedStatePath)
  ) {
    fail("commit tracked changes before planning production infrastructure");
  }
  command("git", ["fetch", "origin", "main"], {
    failure: "could not refresh origin/main",
  });
  const remoteSha = command("git", ["rev-parse", "origin/main"], {
    capture: true,
    failure: "could not determine origin/main",
  });
  if (sha !== remoteSha)
    fail("production infrastructure must use the pushed origin/main revision");
}

async function runtime(identityFile) {
  if (!process.env.DIGITALOCEAN_TOKEN) {
    fail("DIGITALOCEAN_TOKEN must be set in the operator environment");
  }
  const privateDirectory = await mkdtemp(join(tmpdir(), "zoomigo-iac-"));
  const openedDirectory = join(privateDirectory, "secrets");
  try {
    await openProductionBundle(
      identityFile,
      PRODUCTION_BUNDLE,
      openedDirectory,
    );
    const cloudflareEnvironment = parseEnvironment(
      await readFile(join(openedDirectory, "cloudflare.env"), "utf8"),
    );
    if (!cloudflareEnvironment.CLOUDFLARE_API_TOKEN) {
      fail("cloudflare.env is missing CLOUDFLARE_API_TOKEN");
    }
    const sshPublicKey = command(
      "ssh-keygen",
      ["-y", "-P", "", "-f", join(openedDirectory, "deploy_ssh_key")],
      {
        capture: true,
        failure: "could not derive the deployment SSH public key",
      },
    );
    return {
      cleanup: () => rm(privateDirectory, { recursive: true, force: true }),
      environment: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: cloudflareEnvironment.CLOUDFLARE_API_TOKEN,
      },
      sshPublicKey,
    };
  } catch (error) {
    await rm(privateDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function withState(identityFile, action) {
  const originalHash = await restoreState(identityFile);
  try {
    return await action();
  } finally {
    await persistState(originalHash);
  }
}

async function plan(identityFile) {
  const sha = releaseSha();
  assertReviewableRelease(sha);
  const configuration = JSON.parse(await readFile(PRODUCTION_CONFIG, "utf8"));
  const context = await runtime(identityFile);
  try {
    await withState(identityFile, async () => {
      command("tofu", ["init", "-input=false"], {
        cwd: INFRASTRUCTURE_DIRECTORY,
        env: context.environment,
      });
      command("tofu", ["fmt", "-check"], { cwd: INFRASTRUCTURE_DIRECTORY });
      command("tofu", ["validate"], {
        cwd: INFRASTRUCTURE_DIRECTORY,
        env: context.environment,
      });
      command(
        "tofu",
        [
          "plan",
          "-input=false",
          "-out",
          PLAN_FILE,
          `-var=release_sha=${sha}`,
          `-var=ssh_public_key=${context.sshPublicKey}`,
          `-var=api_hostname=${configuration.apiHostname}`,
          `-var=pwa_hostname=${configuration.pwaHostname}`,
        ],
        { cwd: INFRASTRUCTURE_DIRECTORY, env: context.environment },
      );
      await writeFile(PLAN_SHA_FILE, `${sha}\n`, { mode: 0o600 });
    });
  } finally {
    await context.cleanup();
  }
  console.log(`Plan saved at ${PLAN_FILE}. Review it before apply.`);
}

async function apply(identityFile, confirmation) {
  if (confirmation !== "zoomigo") fail("apply requires --confirm zoomigo");
  const sha = releaseSha();
  assertReviewableRelease(sha, true);
  if (!(await exists(PLAN_FILE)) || !(await exists(PLAN_SHA_FILE))) {
    fail("run and review provision.sh plan first");
  }
  if ((await readFile(PLAN_SHA_FILE, "utf8")).trim() !== sha) {
    fail("the saved plan belongs to a different revision; create a new plan");
  }
  const context = await runtime(identityFile);
  try {
    await withState(identityFile, async () => {
      command("tofu", ["apply", "-input=false", PLAN_FILE], {
        cwd: INFRASTRUCTURE_DIRECTORY,
        env: context.environment,
      });
    });
  } finally {
    await context.cleanup();
  }
  console.log(
    "Infrastructure applied. Commit the rotated encrypted Terraform state.",
  );
}

async function output(identityFile) {
  await withState(identityFile, async () => {
    command("tofu", ["output"], { cwd: INFRASTRUCTURE_DIRECTORY });
  });
}

async function main() {
  const [operation, identityArgument, flag, confirmation] =
    process.argv.slice(2);
  if (!operation || !identityArgument) {
    fail(
      "usage: provision.sh plan|apply|output IDENTITY_FILE [--confirm zoomigo]",
    );
  }
  const identityFile = resolve(identityArgument);
  if (operation === "plan") return plan(identityFile);
  if (operation === "apply")
    return apply(identityFile, flag === "--confirm" ? confirmation : "");
  if (operation === "output") return output(identityFile);
  fail(
    "usage: provision.sh plan|apply|output IDENTITY_FILE [--confirm zoomigo]",
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
