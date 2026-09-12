import assert from "node:assert/strict";
import {
  access,
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { hostKeyBranch, publishHostKeyBranch } from "./pin-host-key-branch.mjs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("host-key handoff uses only bounded GitHub run IDs and attempts", () => {
  assert.equal(hostKeyBranch("12345", "2"), "codex/host-key-12345-2");
  assert.notEqual(hostKeyBranch("12345", "1"), hostKeyBranch("12345", "2"));
  assert.notEqual(hostKeyBranch("12345", "1"), hostKeyBranch("12346", "1"));
  for (const bad of [
    "",
    "0",
    "-1",
    "1/main",
    "1;exit",
    "1\n",
    "9".repeat(21),
  ]) {
    assert.throws(() => hostKeyBranch(bad, "1"));
  }
  for (const bad of ["", "0", "1;exit", "9".repeat(6)]) {
    assert.throws(() => hostKeyBranch("1", bad));
  }
});

test("host-key handoff pushes only the pin feature branch and leaves main unchanged", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "zoomigo-pin-handoff-"));
  try {
    const checkout = join(fixture, "checkout"),
      remote = join(fixture, "remote.git");
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: checkout,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    await mkdir(checkout);
    execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
    git("init", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.name", "Local fixture");
    git("config", "user.email", "fixture@example.test");
    await mkdir(join(checkout, "infra"));
    await writeFile(join(checkout, "infra/known_hosts"), "old pin\n");
    await writeFile(join(checkout, "unrelated.txt"), "original\n");
    git("add", ".");
    git("commit", "-m", "fixture");
    git("remote", "add", "origin", remote);
    git("push", "origin", "main");
    const original = git("rev-parse", "main");
    await writeFile(join(checkout, "infra/known_hosts"), "new verified pin\n");
    await writeFile(join(checkout, "unrelated.txt"), "unrelated staged work\n");
    git("add", "unrelated.txt");
    const env = {
      GITHUB_RUN_ID: "12345",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "dafepro/fc-workout-pwa",
      GITHUB_STEP_SUMMARY: join(fixture, "summary.md"),
    };
    publishHostKeyBranch(env, checkout);
    assert.equal(
      git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0],
      original,
    );
    assert.equal(
      git("diff", "--name-only", `${original}..HEAD`),
      "infra/known_hosts",
    );
    assert.equal(git("diff", "--cached", "--name-only"), "unrelated.txt");
    assert.match(
      git("ls-remote", "origin", "refs/heads/codex/host-key-12345-2"),
      /refs\/heads\/codex\/host-key-12345-2$/,
    );
    assert.match(
      await readFile(env.GITHUB_STEP_SUMMARY, "utf8"),
      /compare\/main\.\.\.codex\/host-key-12345-2\?expand=1/,
    );
    const head = git("rev-parse", "HEAD");
    publishHostKeyBranch({ ...env, GITHUB_RUN_ATTEMPT: "3" }, checkout);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(
      git("ls-remote", "origin", "refs/heads/codex/host-key-12345-3"),
      "",
    );
    await writeFile(
      join(checkout, "infra/known_hosts"),
      "second verified pin\n",
    );
    publishHostKeyBranch({ ...env, GITHUB_RUN_ATTEMPT: "3" }, checkout);
    assert.equal(
      git("ls-remote", "origin", "refs/heads/codex/host-key-12345-2").split(
        /\s/,
      )[0],
      head,
    );
    assert.equal(
      git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0],
      original,
    );
    const workflow = await readFile(
      join(root, ".github/workflows/infra.yml"),
      "utf8",
    );
    assert.match(workflow, /node scripts\/pin-host-key-branch\.mjs/);
    assert.doesNotMatch(workflow, /git push|pull-requests: write|gh pr create/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("macOS and Linux are the canonical local automation path", async () => {
  const required = [
    "scripts/verify.sh",
    "scripts/e2e.sh",
    "scripts/e2e-visual.sh",
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
  const ordinaryVerification = verifier.split('if [ "$RUN_E2E" = true ]')[0];
  for (const command of ["go vet -tags=dev ./...", "go test -tags=dev ./..."]) {
    assert.ok(
      ordinaryVerification.split(/\r?\n/).includes(command),
      `${command} must run in the default required PR check`,
    );
  }
  assert.match(contracts, /ZoomiGo production automation contract passed/);
});

test("the browser image runs Playwright without recursing into Docker", async () => {
  const [dockerfile, packageDocument, visualRunner] = await Promise.all([
    readFile(join(root, "Dockerfile.e2e"), "utf8"),
    readFile(join(root, "package.json"), "utf8"),
    readFile(join(root, "scripts/e2e-visual.sh"), "utf8"),
  ]);
  const scripts = JSON.parse(packageDocument).scripts;

  assert.equal(scripts["test:e2e"], "./scripts/e2e.sh");
  assert.equal(scripts["test:e2e:visual"], "./scripts/e2e-visual.sh");
  assert.equal(
    scripts["test:e2e:visual:update"],
    "./scripts/e2e-visual.sh --update-snapshots",
  );
  assert.equal(scripts["test:browser"], "playwright test");
  assert.match(dockerfile, /CMD \["pnpm", "test:browser"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["pnpm", "test:e2e"\]/);
  assert.match(visualRunner, /--volume.*\/e2e:\/app\/e2e/);
  assert.match(visualRunner, /--update-snapshots/);
});
