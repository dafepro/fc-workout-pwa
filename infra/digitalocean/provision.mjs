#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INFRASTRUCTURE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(INFRASTRUCTURE_DIRECTORY, "../..");
const PRODUCTION_CONFIG = join(REPOSITORY_ROOT, "deploy/production.json");
const PLAN_FILE = join(INFRASTRUCTURE_DIRECTORY, "zoomigo.tfplan");
const PLAN_SHA_FILE = `${PLAN_FILE}.sha`;
const STATE_KEY = "infra/digitalocean/terraform.tfstate";

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
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function requireEnv(env, name) {
  const value = env[name];
  if (!value) fail(`${name} must be set in the operator environment`);
  return value;
}

export function backendConfigArgs(env) {
  const bucket = requireEnv(env, "TF_STATE_BUCKET");
  const endpoint = requireEnv(env, "TF_STATE_ENDPOINT");
  const accessKey = requireEnv(env, "TF_STATE_ACCESS_KEY_ID");
  const secretKey = requireEnv(env, "TF_STATE_SECRET_ACCESS_KEY");
  return [
    `-backend-config=bucket=${bucket}`,
    `-backend-config=key=${STATE_KEY}`,
    // "endpoints.s3=..." (dotted path into the nested endpoints object) is
    // rejected by -backend-config's flat key=value parser; the deprecated
    // top-level "endpoint" string alias is the only CLI-settable form.
    `-backend-config=endpoint=${endpoint}`,
    "-backend-config=region=auto",
    "-backend-config=use_path_style=true",
    "-backend-config=use_lockfile=true",
    // R2 is not AWS: "auto" is not a real AWS region and there is no STS
    // account-ID/metadata endpoint to query.
    "-backend-config=skip_region_validation=true",
    "-backend-config=skip_credentials_validation=true",
    "-backend-config=skip_requesting_account_id=true",
    "-backend-config=skip_metadata_api_check=true",
    `-backend-config=access_key=${accessKey}`,
    `-backend-config=secret_key=${secretKey}`,
  ];
}

function releaseSha() {
  return command("git", ["rev-parse", "HEAD"], {
    capture: true,
    failure: "could not determine the release revision",
  });
}

function assertReviewableRelease(sha) {
  const changed = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { capture: true, failure: "could not inspect the worktree" },
  );
  if (changed.trim()) {
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

function initBackend(env) {
  command("tofu", ["init", "-input=false", ...backendConfigArgs(env)], {
    cwd: INFRASTRUCTURE_DIRECTORY,
    env,
  });
}

async function plan(sshKeyFile) {
  const sha = releaseSha();
  assertReviewableRelease(sha);
  const configuration = JSON.parse(await readFile(PRODUCTION_CONFIG, "utf8"));
  requireEnv(process.env, "DIGITALOCEAN_TOKEN");
  requireEnv(process.env, "CLOUDFLARE_API_TOKEN");
  const sshPublicKey = command(
    "ssh-keygen",
    ["-y", "-P", "", "-f", sshKeyFile],
    {
      capture: true,
      failure: "could not derive the deployment SSH public key",
    },
  );
  initBackend(process.env);
  command("tofu", ["fmt", "-check"], { cwd: INFRASTRUCTURE_DIRECTORY });
  command("tofu", ["validate"], { cwd: INFRASTRUCTURE_DIRECTORY });
  command(
    "tofu",
    [
      "plan",
      "-input=false",
      "-out",
      PLAN_FILE,
      `-var=release_sha=${sha}`,
      `-var=ssh_public_key=${sshPublicKey}`,
      `-var=api_hostname=${configuration.apiHostname}`,
      `-var=pwa_hostname=${configuration.pwaHostname}`,
    ],
    { cwd: INFRASTRUCTURE_DIRECTORY },
  );
  await writeFile(PLAN_SHA_FILE, `${sha}\n`, { mode: 0o600 });
  console.log(`Plan saved at ${PLAN_FILE}. Review it before apply.`);
}

async function apply(confirmation) {
  if (confirmation !== "zoomigo") fail("apply requires --confirm zoomigo");
  const sha = releaseSha();
  assertReviewableRelease(sha);
  if (!(await exists(PLAN_FILE)) || !(await exists(PLAN_SHA_FILE))) {
    fail("run and review provision.sh plan first");
  }
  if ((await readFile(PLAN_SHA_FILE, "utf8")).trim() !== sha) {
    fail("the saved plan belongs to a different revision; create a new plan");
  }
  requireEnv(process.env, "DIGITALOCEAN_TOKEN");
  requireEnv(process.env, "CLOUDFLARE_API_TOKEN");
  initBackend(process.env);
  command("tofu", ["apply", "-input=false", PLAN_FILE], {
    cwd: INFRASTRUCTURE_DIRECTORY,
  });
  await rm(PLAN_FILE, { force: true });
  await rm(PLAN_SHA_FILE, { force: true });
  console.log("Infrastructure applied.");
}

async function output() {
  initBackend(process.env);
  command("tofu", ["output"], { cwd: INFRASTRUCTURE_DIRECTORY });
}

async function main() {
  const [operation, ...rest] = process.argv.slice(2);
  if (operation === "plan") {
    if (!rest[0]) fail("usage: provision.sh plan SSH_KEY_FILE");
    return plan(resolve(rest[0]));
  }
  if (operation === "apply") {
    return apply(rest[0] === "--confirm" ? rest[1] : "");
  }
  if (operation === "output") return output();
  fail(
    "usage: provision.sh plan SSH_KEY_FILE | apply --confirm zoomigo | output",
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
