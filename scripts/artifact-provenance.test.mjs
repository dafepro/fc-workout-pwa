import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProducer, validateManifest } from "./artifact-provenance.mjs";

const sha = "a".repeat(40);
const expected = {
  repository: "dafepro/fc-workout-pwa",
  workflow: ".github/workflows/infra.yml",
  workflowId: 123,
  sha,
  job: "tofu plan",
  artifact: "tfplan-v2",
  events: ["workflow_dispatch"],
};
const run = {
  repository: { full_name: expected.repository },
  head_repository: { full_name: expected.repository },
  path: expected.workflow,
  workflow_id: 123,
  head_branch: "main",
  head_sha: sha,
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
};
const jobs = [{ name: "tofu plan", conclusion: "success" }];
const artifacts = [{ id: 7, name: "tfplan-v2", expired: false }];

test("accepts only the successful expected main producer and unique live artifact", () => {
  assert.equal(validateProducer(run, jobs, artifacts, expected).id, 7);
});

for (const [field, value] of [
  ["repository", { full_name: "attacker/repo" }],
  ["head_repository", { full_name: "attacker/repo" }],
  ["path", ".github/workflows/other.yml"],
  ["workflow_id", 456],
  ["head_branch", "candidate"],
  ["head_sha", "b".repeat(40)],
  ["event", "pull_request"],
  ["status", "in_progress"],
  ["conclusion", "failure"],
]) {
  test(`rejects producer with wrong ${field}`, () => {
    assert.throws(() =>
      validateProducer({ ...run, [field]: value }, jobs, artifacts, expected),
    );
  });
}

test("rejects skipped/failed producer jobs, expired, missing and duplicate artifacts", () => {
  for (const conclusion of ["skipped", "failure", "cancelled"]) {
    assert.throws(() =>
      validateProducer(
        run,
        [{ name: "tofu plan", conclusion }],
        artifacts,
        expected,
      ),
    );
  }
  for (const invalid of [
    [],
    [{ ...artifacts[0], expired: true }],
    [...artifacts, artifacts[0]],
  ]) {
    assert.throws(() => validateProducer(run, jobs, invalid, expected));
  }
});

test("manifest requires current schema, matching SHA/profile and checksum", () => {
  const digest = "b".repeat(64);
  const manifest = {
    schema: 2,
    sha,
    profile: "infrastructure",
    checksum: digest,
  };
  validateManifest(manifest, sha, "infrastructure", digest);
  for (const change of [
    { schema: 1 },
    { sha: "c".repeat(40) },
    { profile: "development" },
    { checksum: "d".repeat(64) },
  ]) {
    assert.throws(() =>
      validateManifest(
        { ...manifest, ...change },
        sha,
        "infrastructure",
        digest,
      ),
    );
  }
});

test("production and development artifacts preserve immutable image metadata and reject tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-artifact-"));
  try {
    const payload = join(root, "worker.tgz");
    const manifest = join(root, "release-manifest.json");
    await writeFile(payload, "verified frontend fixture");
    const invoke = (command, profile) =>
      spawnSync(
        process.execPath,
        [
          new URL("./artifact-provenance.mjs", import.meta.url).pathname,
          command,
          profile,
          sha,
          payload,
          manifest,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ENV: "",
            CONTROLLER_SHA: sha,
            API_DIGEST: `sha256:${"b".repeat(64)}`,
            RELAY_DIGEST: `sha256:${"c".repeat(64)}`,
          },
        },
      );
    for (const profile of ["production", "development"]) {
      assert.equal(invoke("create", profile).status, 0);
      const receipt = JSON.parse(await readFile(manifest, "utf8"));
      assert.equal(receipt.apiDigest, `sha256:${"b".repeat(64)}`);
      assert.equal(invoke("verify", profile).status, 0);
      assert.notEqual(
        invoke(
          "verify",
          profile === "production" ? "development" : "production",
        ).status,
        0,
      );
    }
    await writeFile(payload, "tampered frontend");
    assert.notEqual(invoke("verify", "development").status, 0);
    await rm(payload);
    assert.notEqual(invoke("verify", "production").status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
