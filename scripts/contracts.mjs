#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function fail(message) {
  throw new Error(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

async function requireFile(relativePath) {
  try {
    await access(join(ROOT, relativePath));
  } catch {
    fail(`Missing required file: ${relativePath}`);
  }
}

async function text(relativePath) {
  await requireFile(relativePath);
  return readFile(join(ROOT, relativePath), "utf8");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") fail(`${command} is required`);
  if (result.error || result.status !== 0) {
    const detail = options.capture ? result.stderr.trim() : "";
    fail(
      `${options.failure ?? `${command} failed`}${detail ? `: ${detail}` : ""}`,
    );
  }
  return options.capture ? result.stdout : "";
}

function containsEvery(contents, required, label) {
  for (const value of required) {
    requireCondition(contents.includes(value), `${label} is missing ${value}`);
  }
}

async function deploymentContract() {
  const requiredFiles = [
    ".github/workflows/backend-image.yml",
    "deploy/vm/compose.yaml",
    "deploy/vm/systemd/zoomigo-backup.service",
    "deploy/vm/systemd/zoomigo-backup.timer",
    "deploy/vm/scripts/production-check.sh",
    "deploy/vm/scripts/upload-backup-s3.sh",
    "deploy/vm/scripts/install-backup-service.sh",
    "docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md",
    "docs/backend/LIVE_RESTORE_RUNBOOK.md",
  ];
  await Promise.all(requiredFiles.map(requireFile));

  const contractRoot = await mkdtemp(join(tmpdir(), "zoomigo-contract-"));
  const envFile = join(contractRoot, "contract.env");
  try {
    await writeFile(
      envFile,
      [
        "COMPOSE_PROJECT_NAME=zoomigo-contract",
        "API_IMAGE=ghcr.io/dafepro/fc-workout-pwa/api:sha-0123456789abcdef",
        "APP_VERSION=0123456789abcdef",
        "BACKUP_AGE_RECIPIENT=age1contractrecipient",
        "BACKUP_S3_UPLOAD_ENABLED=true",
        "LOCAL_BACKUP_RETENTION_DAYS=7",
        "PRODUCTION_DATA_APPROVED=false",
        "CADDY_SITE_ADDRESS=api.example.com",
        "PWA_ORIGIN=https://zoomigo.example",
        "TEAM_TIME_ZONE=America/Chicago",
        "DATA_DIR=/var/lib/zoomigo/data",
        "BACKUP_DIR=/var/backups/zoomigo",
        "RESTORE_DIR=/var/lib/zoomigo/restore",
        "ADMIN_OUTPUT_DIR=/var/lib/zoomigo/admin-output",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    const rendered = JSON.parse(
      run(
        "docker",
        [
          "compose",
          "--env-file",
          envFile,
          "-f",
          join(ROOT, "deploy/vm/compose.yaml"),
          "--profile",
          "operations",
          "config",
          "--format",
          "json",
        ],
        {
          capture: true,
          failure: "Docker Compose could not render the VM configuration",
        },
      ),
    );
    requireCondition(
      rendered.services.api.image ===
        "ghcr.io/dafepro/fc-workout-pwa/api:sha-0123456789abcdef",
      "The API image must be externally selectable.",
    );
    requireCondition(
      Number(rendered.services.api.mem_limit) === 268435456,
      `The API exceeds the VM memory budget (${rendered.services.api.mem_limit}).`,
    );
    requireCondition(
      Number(rendered.services.caddy.mem_limit) === 100663296,
      `Caddy exceeds the VM memory budget (${rendered.services.caddy.mem_limit}).`,
    );
    requireCondition(
      rendered.services.api.pids_limit === 128,
      "The API must have a PID ceiling.",
    );
    requireCondition(
      rendered.services.caddy.pids_limit === 64,
      "Caddy must have a PID ceiling.",
    );
    requireCondition(
      rendered.services.admin.environment.PRODUCTION_DATA_APPROVED === "false",
      "Real-player provisioning must default to locked.",
    );
    for (const serviceName of ["api", "caddy", "backup", "admin"]) {
      const logging = rendered.services[serviceName].logging;
      requireCondition(
        logging.driver === "local",
        `${serviceName} must use bounded local logs.`,
      );
      requireCondition(
        logging.options["max-size"] === "5m",
        `${serviceName} needs a log size ceiling.`,
      );
      requireCondition(
        logging.options["max-file"] === "3",
        `${serviceName} needs a log count ceiling.`,
      );
    }
  } finally {
    await rm(contractRoot, { recursive: true, force: true });
  }

  const workflow = await text(".github/workflows/backend-image.yml");
  containsEvery(
    workflow,
    ["deploy/release/release.sh", "PRODUCTION_DEPLOY_ENABLED"],
    "Release workflow",
  );
  const deployScript = await text("deploy/vm/scripts/deploy.sh");
  containsEvery(
    deployScript,
    ["compose pull api caddy", "compose build --pull api"],
    "VM deploy script",
  );
  const backupScript = await text("deploy/vm/scripts/backup.sh");
  containsEvery(
    backupScript,
    [
      "create-encrypted",
      "upload-backup-s3.sh",
      "LOCAL_BACKUP_RETENTION_DAYS",
      "set -eu",
    ],
    "Backup script",
  );
  requireCondition(
    backupScript.indexOf('find "$backup_directory"') >
      backupScript.indexOf("upload-backup-s3.sh"),
    "A failed S3 upload must stop before local pruning.",
  );
  containsEvery(
    await text("deploy/vm/systemd/zoomigo-backup.service"),
    [
      "EnvironmentFile=-/etc/zoomigo/backup-s3.env",
      "WorkingDirectory=/opt/app/deploy/vm",
    ],
    "Backup service",
  );
  requireCondition(
    (await text("deploy/vm/scripts/upload-backup-s3.sh")).includes(
      "BACKUP_S3_ENDPOINT",
    ),
    "The uploader must use a provider-neutral S3 endpoint.",
  );
  console.log("Deployment contract checks passed.");
}

async function secretContract() {
  const portable = await text("deploy/secrets/manage-production-secrets.mjs");
  const seal = await text("deploy/secrets/seal-production-secrets.sh");
  const open = await text("deploy/secrets/open-production-secrets.sh");
  await requireFile("deploy/secrets/manage-production-secrets.test.mjs");
  await requireFile("deploy/secrets/README.md");
  containsEvery(
    portable,
    [
      "backup-s3.env",
      "cloudflare.env",
      "deploy.env",
      "deploy_ssh_key",
      "known_hosts",
      '"--encrypt"',
      '"--decrypt"',
      "ACCOUNT_ID\\.r2",
      "basename",
      '"ssh-keygen"',
      '["-y"',
      '["-F"',
    ],
    "Encrypted bundle contract",
  );
  requireCondition(
    !portable.includes("|ACCOUNT_ID|"),
    "Placeholder validation rejects a real variable name.",
  );
  requireCondition(
    seal.includes("manage-production-secrets.mjs") &&
      open.includes("manage-production-secrets.mjs"),
    "Secret shell entrypoints must use the portable Node implementation.",
  );
  requireCondition(
    !seal.includes("tar ") &&
      !open.includes("tar ") &&
      !portable.includes("tar "),
    "Secret handling must not depend on tar.",
  );
  const gitignore = await text(".gitignore");
  containsEvery(
    gitignore,
    ["/deploy/secrets/plaintext/", "/deploy/secrets/*identity*"],
    "Secret ignore rules",
  );
  run("node", [
    "--test",
    join(ROOT, "deploy/secrets/manage-production-secrets.test.mjs"),
  ]);
  console.log("ZoomiGo encrypted-secret contract passed.");
}

async function releaseContract() {
  const required = [
    "deploy/release/release.sh",
    "deploy/release/publish-image.sh",
    "deploy/release/deploy-vm.sh",
    "deploy/vm/scripts/set-release.sh",
  ];
  await Promise.all(required.map(requireFile));
  const workflow = await text(".github/workflows/backend-image.yml");
  containsEvery(
    workflow,
    [
      "PRODUCTION_DEPLOY_ENABLED",
      "ZOOMIGO_DEPLOY_AGE_IDENTITY",
      "environment: production",
      "deploy/release/release.sh",
    ],
    "Release workflow",
  );
  const release = await text("deploy/release/release.sh");
  containsEvery(
    release,
    ["open-production-secrets.sh", "wrangler deploy"],
    "Release script",
  );
  requireCondition(
    release.indexOf('. "$secrets_directory/cloudflare.env"') >
      release.indexOf("pnpm build"),
    "Cloudflare credentials must not enter the build environment.",
  );
  requireCondition(
    release.indexOf("open-production-secrets.sh") >
      release.indexOf("publish-image.sh"),
    "The fallback must publish before decrypting deployment secrets.",
  );
  containsEvery(
    await text("deploy/release/publish-image.sh"),
    [
      "docker buildx build",
      "--platform linux/amd64",
      "--push",
      "git status --porcelain",
    ],
    "Image publisher",
  );
  const vmDeploy = await text("deploy/release/deploy-vm.sh");
  requireCondition(
    vmDeploy.indexOf("git checkout") >
      vmDeploy.indexOf("systemctl start zoomigo-backup.service"),
    "VM release must back up before checkout.",
  );
  containsEvery(
    vmDeploy,
    ["StrictHostKeyChecking=yes", "backup-s3.env"],
    "VM release",
  );
  console.log("ZoomiGo continuous-release contract passed.");
}

async function iacContract() {
  const required = [
    "versions.tf",
    "variables.tf",
    "main.tf",
    "outputs.tf",
    "cloud-init.yaml.tftpl",
    "environment.tftpl",
    "terraform.tfvars.example",
    ".terraform.lock.hcl",
    "README.md",
    "provision.mjs",
    "provision.test.mjs",
    "provision.sh",
    "adopt-host.mjs",
    "adopt-host.test.mjs",
    "adopt-host.sh",
  ];
  await Promise.all(
    required.map((name) => requireFile(`infra/digitalocean/${name}`)),
  );
  const terraform = (
    await Promise.all(
      required
        .filter((name) => name.endsWith(".tf"))
        .map((name) => text(`infra/digitalocean/${name}`)),
    )
  ).join("\n");
  containsEvery(
    terraform,
    [
      'resource "digitalocean_project"',
      'resource "digitalocean_droplet"',
      'resource "digitalocean_reserved_ip"',
      'resource "digitalocean_firewall"',
      'resource "digitalocean_monitor_alert"',
      'resource "digitalocean_uptime_check"',
      'resource "digitalocean_uptime_alert"',
      'resource "cloudflare_dns_record"',
      "prevent_destroy = true",
      "s-1vcpu-512mb-10gb",
    ],
    "OpenTofu configuration",
  );
  requireCondition(
    !terraform.includes('variable "digitalocean_token"') &&
      !terraform.includes('variable "cloudflare_api_token"'),
    "Provider credentials must not enter OpenTofu state.",
  );
  const cloudInit = await text("infra/digitalocean/cloud-init.yaml.tftpl");
  requireCondition(
    !/(api[_-]?token|secret|private[_-]?key)/i.test(cloudInit),
    "Cloud-init must not contain deployment secrets.",
  );
  containsEvery(
    await text("infra/digitalocean/README.md"),
    ["tofu plan", "No secrets"],
    "OpenTofu documentation",
  );
  const gitignore = await text(".gitignore");
  containsEvery(
    gitignore,
    [
      "**/terraform.tfvars",
      "**/*.auto.tfvars",
      "!infra/digitalocean/terraform.tfstate.age",
    ],
    "OpenTofu ignore rules",
  );
  run("node", [
    "--test",
    join(ROOT, "infra/digitalocean/provision.test.mjs"),
    join(ROOT, "infra/digitalocean/adopt-host.test.mjs"),
  ]);
  console.log("ZoomiGo OpenTofu contract passed.");
}

async function productionAutomationContract() {
  const requiredFiles = [
    "deploy/production.json",
    "infra/digitalocean/provision.mjs",
    "infra/digitalocean/provision.sh",
    "infra/digitalocean/adopt-host.mjs",
    "infra/digitalocean/adopt-host.sh",
    "infra/digitalocean/environment.tftpl",
    "deploy/release/configure-worker.mjs",
    "docs/PRODUCTION_RUNBOOK.md",
  ];
  await Promise.all(requiredFiles.map(requireFile));
  const config = JSON.parse(await text("deploy/production.json"));
  requireCondition(
    config.apiHostname === "api.quicktrack.cc",
    "The API hostname is not centralized.",
  );
  requireCondition(
    config.pwaHostname === "zoomigo.quicktrack.cc",
    "The PWA hostname is not centralized.",
  );
  const terraform = await text("infra/digitalocean/main.tf");
  containsEvery(
    terraform,
    [
      'resource "digitalocean_project"',
      'resource "digitalocean_reserved_ip"',
      'resource "digitalocean_droplet"',
      'resource "digitalocean_firewall"',
      'resource "digitalocean_monitor_alert"',
      'resource "digitalocean_uptime_check"',
      'resource "digitalocean_uptime_alert"',
      'resource "cloudflare_dns_record"',
    ],
    "Production IaC",
  );
  const cloudInit = await text("infra/digitalocean/cloud-init.yaml.tftpl");
  containsEvery(
    cloudInit,
    [
      "cloud-init status",
      "git, clone",
      "environment_file",
      "install-backup-service.sh",
      "      ${environment_file}",
    ],
    "Cloud-init",
  );
  containsEvery(
    await text("infra/digitalocean/provision.mjs"),
    [
      "DIGITALOCEAN_TOKEN",
      "CLOUDFLARE_API_TOKEN",
      "tofu",
      "release_sha",
      "production.tar.gz.age",
    ],
    "Provisioning orchestration",
  );
  containsEvery(
    await text("infra/digitalocean/adopt-host.mjs"),
    [
      "ssh-keyscan",
      "expected-fingerprint",
      "known_hosts",
      "DEPLOY_HOST",
      "production.tar.gz.age",
    ],
    "Host adoption",
  );
  requireCondition(
    (await text("deploy/release/configure-worker.mjs")).includes(
      "custom_domain",
    ) && (await text("deploy/release/release.sh")).includes("configure-worker"),
    "Release must configure the Worker custom domain.",
  );
  run("node", [
    "--test",
    join(ROOT, "deploy/release/configure-worker.test.mjs"),
  ]);
  const obsolete = [
    "docs/backend/DIGITALOCEAN_UNDER_5_RUNBOOK.md",
    "docs/backend/CLOUD_VM_DEPLOYMENT.md",
    "deploy/vm/README.md",
    "deploy/vm/scripts/migrate-legacy-install.sh",
    "deploy/vm/scripts/prepare-small-vm.sh",
  ];
  for (const path of obsolete) {
    try {
      await access(join(ROOT, path));
      fail(`Outdated production setup cruft remains: ${path}`);
    } catch (error) {
      if (error?.message?.startsWith("Outdated")) throw error;
    }
  }
  const powershell = (await readdir(join(ROOT, "scripts"))).filter((name) =>
    name.endsWith(".ps1"),
  );
  requireCondition(
    powershell.length === 0,
    `PowerShell automation remains: ${powershell.join(" ")}`,
  );
  console.log("ZoomiGo production automation contract passed.");
}

async function brandingContract() {
  const fileList = run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { capture: true, failure: "Could not enumerate repository files" },
  )
    .split("\0")
    .filter(Boolean);
  const textExtensions = new Set([
    ".go",
    ".json",
    ".md",
    ".mjs",
    ".service",
    ".sh",
    ".tf",
    ".timer",
    ".ts",
    ".tsx",
    ".tftpl",
    ".webmanifest",
    ".yaml",
    ".yml",
  ]);
  const matches = [];
  for (const path of fileList) {
    if (
      /^docs\/_ALPHA_FEEDBACK_0\.[0-6]\.md$/.test(path) ||
      path === "scripts/contracts.mjs"
    )
      continue;
    if (path !== ".gitignore" && !textExtensions.has(extname(path))) continue;
    let contents;
    try {
      contents = await readFile(join(ROOT, path), "utf8");
    } catch {
      continue;
    }
    if (/stride[ _-]?crew/i.test(contents)) matches.push(path);
  }
  requireCondition(
    matches.length === 0,
    `Legacy product identifiers remain in: ${matches.join(" ")}`,
  );
  console.log("ZoomiGo branding contract passed.");
}

async function main() {
  await deploymentContract();
  await brandingContract();
  await secretContract();
  await releaseContract();
  await iacContract();
  await productionAutomationContract();
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
