import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("macOS and Linux are the canonical local automation path", async () => {
  const required = [
    "scripts/verify.sh",
    "scripts/e2e.sh",
    "scripts/vm-smoke.sh",
    "scripts/contracts.mjs",
    "infra/digitalocean/provision.sh",
    "infra/digitalocean/adopt-host.sh",
  ];
  await Promise.all(required.map((path) => access(join(root, path))));

  const [workflow, runbook, packageDocument, verifier, contracts] =
    await Promise.all([
      readFile(join(root, ".github/workflows/backend-image.yml"), "utf8"),
      readFile(join(root, "docs/PRODUCTION_RUNBOOK.md"), "utf8"),
      readFile(join(root, "package.json"), "utf8"),
      readFile(join(root, "scripts/verify.sh"), "utf8"),
      readFile(join(root, "scripts/contracts.mjs"), "utf8"),
    ]);

  assert.match(workflow, /\.\/scripts\/verify\.sh/);
  assert.match(workflow, /\.\/scripts\/e2e\.sh/);
  assert.match(workflow, /\.\/scripts\/vm-smoke\.sh/);
  assert.match(workflow, /run_e2e:[\s\S]*type: boolean[\s\S]*default: false/);
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.run_e2e/,
  );
  assert.doesNotMatch(workflow, /\.ps1/);
  assert.match(runbook, /infra\/digitalocean\/provision\.sh/);
  assert.match(runbook, /infra\/digitalocean\/adopt-host\.sh/);
  assert.doesNotMatch(runbook, /PowerShell|Git Bash|WSL/);
  assert.equal(
    JSON.parse(packageDocument).scripts.verify,
    "./scripts/verify.sh",
  );
  assert.match(verifier, /node.*contracts\.mjs/);
  assert.match(verifier, /--all/);
  assert.match(contracts, /ZoomiGo production automation contract passed/);
});
