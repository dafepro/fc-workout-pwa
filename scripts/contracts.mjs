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

/**
 * Drops whole-line comments, so a requirement cannot be satisfied by a line that
 * is commented out. Every file matched this way is shell, YAML, or a systemd
 * unit, all of which comment with a leading `#`.
 *
 * Only lines that are entirely a comment go: a trailing `#` is not reliably a
 * comment in shell, and guessing wrong would drop a line that really does
 * satisfy the contract. Absence checks deliberately keep reading the raw text --
 * a mention in a comment cannot satisfy a requirement, but it is still worth
 * knowing about when the rule is that something must not appear at all.
 */
function code(contents) {
  return contents
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

function containsEvery(contents, required, label) {
  const source = code(contents);
  for (const value of required) {
    requireCondition(source.includes(value), `${label} is missing ${value}`);
  }
}

async function deploymentContract() {
  const requiredFiles = [
    ".github/workflows/backend-image.yml",
    ".github/workflows/release.yml",
    "deploy/vm/compose.yaml",
    "deploy/vm/systemd/zoomigo-backup.service",
    "deploy/vm/systemd/zoomigo-backup.timer",
    "deploy/vm/scripts/production-check.sh",
    "deploy/vm/scripts/set-console-settings.sh",
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

  const workflow = await text(".github/workflows/release.yml");
  containsEvery(
    workflow,
    ["deploy/release/release.sh", "PRODUCTION_DEPLOY_ENABLED"],
    "Release workflow",
  );
  requireCondition(
    /^    if: github\.ref == 'refs\/heads\/main' && vars\.PRODUCTION_DEPLOY_ENABLED == 'true'$/m.test(
      workflow,
    ),
    "The production release job must run only from the main workflow ref.",
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
      "export-encrypted",
      "upload-backup-s3.sh",
      "LOCAL_BACKUP_RETENTION_DAYS",
      "set -eu",
    ],
    "Backup script",
  );
  requireCondition(
    code(backupScript).indexOf('find "$backup_directory"') >
      code(backupScript).indexOf("upload-backup-s3.sh"),
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
  await requireFile("deploy/secrets/README.md");
  await requireFile(".github/workflows/infra.yml");

  const obsolete = [
    "deploy/secrets/manage-production-secrets.mjs",
    "deploy/secrets/manage-production-secrets.test.mjs",
    "deploy/secrets/seal-production-secrets.sh",
    "deploy/secrets/open-production-secrets.sh",
    "deploy/secrets/production.tar.gz.age",
    "deploy/secrets/production-recipients.txt",
  ];
  for (const path of obsolete) {
    try {
      await access(join(ROOT, path));
      fail(`Retired secrets-bundle artifact remains: ${path}`);
    } catch (error) {
      if (error?.message?.startsWith("Retired")) throw error;
    }
  }

  const workflow = await text(".github/workflows/release.yml");
  containsEvery(
    workflow,
    [
      "ZOOMIGO_DEPLOY_SSH_KEY",
      "secrets.CLOUDFLARE_API_TOKEN",
      "secrets.CLOUDFLARE_ACCOUNT_ID",
      "secrets.BACKUP_S3_ACCESS_KEY_ID",
      "secrets.BACKUP_S3_SECRET_ACCESS_KEY",
      "vars.DEPLOY_HOST",
      "vars.ZOOMIGO_API_BASE_URL",
    ],
    "Release workflow secrets",
  );
  requireCondition(
    !workflow.includes("ZOOMIGO_DEPLOY_AGE_IDENTITY"),
    "The retired deployment bundle identity must not be referenced.",
  );

  const infraWorkflow = await text(".github/workflows/infra.yml");
  containsEvery(
    infraWorkflow,
    [
      "secrets.DIGITALOCEAN_TOKEN",
      "secrets.TF_STATE_ACCESS_KEY_ID",
      "secrets.TF_STATE_SECRET_ACCESS_KEY",
      "secrets.CLOUDFLARE_ACCOUNT_ID",
      "vars.TF_STATE_BUCKET",
      "vars.TF_STATE_ENDPOINT",
      "environment: production",
      "tofu apply",
    ],
    "Infrastructure workflow",
  );
  requireCondition(
    /^    if: github\.ref == 'refs\/heads\/main' && inputs\.action == 'plan'$/m.test(
      infraWorkflow,
    ),
    "The production infrastructure plan must run only from the main workflow ref.",
  );
  requireCondition(
    /^    if: github\.ref == 'refs\/heads\/main' && inputs\.action == 'apply'$/m.test(
      infraWorkflow,
    ),
    "The production infrastructure apply must run only from the main workflow ref.",
  );

  const gitignore = await text(".gitignore");
  containsEvery(
    gitignore,
    ["/deploy/secrets/plaintext/", "/deploy/secrets/*identity*"],
    "Secret ignore rules",
  );
  console.log("ZoomiGo GitHub-secrets contract passed.");
}

async function releaseContract() {
  const required = [
    "deploy/release/release.sh",
    "deploy/release/publish-image.sh",
    "deploy/release/deploy-vm.sh",
    "deploy/vm/scripts/set-release.sh",
  ];
  await Promise.all(required.map(requireFile));
  const workflow = await text(".github/workflows/release.yml");
  containsEvery(
    workflow,
    [
      "PRODUCTION_DEPLOY_ENABLED",
      "ZOOMIGO_DEPLOY_SSH_KEY",
      "environment: production",
      "deploy/release/release.sh",
    ],
    "Release workflow",
  );
  requireCondition(
    !workflow.includes("ZOOMIGO_DEPLOY_AGE_IDENTITY"),
    "The release workflow must not depend on the retired deployment bundle identity.",
  );
  requireCondition(
    !workflow.includes("vars.ANALYTICS_D1_DATABASE_ID"),
    "The release workflow must discover D1 instead of copying its identifier into GitHub.",
  );
  const release = await text("deploy/release/release.sh");
  requireCondition(
    !release.includes("open-production-secrets.sh") &&
      !release.includes("manage-production-secrets"),
    "release.sh must not depend on the retired secrets bundle.",
  );
  containsEvery(
    release,
    [
      "ZOOMIGO_DEPLOY_SSH_KEY",
      "infra/known_hosts",
      "BACKUP_S3_ACCESS_KEY_ID",
      "wrangler d1 list --json",
      "resolve-analytics-d1.mjs",
      "wrangler deploy",
    ],
    "Release script",
  );
  requireCondition(
    code(release).indexOf("publish-image.sh") <
      code(release).indexOf("deploy-vm.sh"),
    "The fallback must publish the image before deploying it to the VM.",
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
    code(vmDeploy).indexOf("git checkout") >
      code(vmDeploy).indexOf("systemctl start zoomigo-backup.service"),
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
  await requireFile("infra/known_hosts");
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
      'resource "cloudflare_d1_database"',
      "analytics_d1_database_id",
      "prevent_destroy = true",
      "s-1vcpu-512mb-10gb",
      'backend "s3"',
    ],
    "OpenTofu configuration",
  );
  requireCondition(
    !terraform.includes('variable "digitalocean_token"') &&
      !terraform.includes('variable "cloudflare_api_token"'),
    "Provider credentials must not enter OpenTofu state.",
  );
  requireCondition(
    /required_version\s*=\s*">=\s*1\.10\.0"/.test(terraform),
    "OpenTofu must require the version with native S3 state locking.",
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
    ["**/terraform.tfvars", "**/*.auto.tfvars", "**/*.tfstate"],
    "OpenTofu ignore rules",
  );
  requireCondition(
    !gitignore.includes("terraform.tfstate.age"),
    "Terraform state is no longer committed as an encrypted artifact.",
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
    "deploy/release/resolve-analytics-d1.mjs",
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
      'resource "cloudflare_d1_database"',
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
      "backend-config",
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
      "gh variable set",
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
    join(ROOT, "deploy/release/resolve-analytics-d1.test.mjs"),
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
