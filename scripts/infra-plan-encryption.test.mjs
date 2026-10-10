import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { planEncryption } from "./infra-plan-encryption.mjs";

test("plan protection refuses a missing or malformed key", () => {
  for (const key of [undefined, "", "short", '"\nplan { enforced = false }'])
    assert.throws(() => planEncryption(key), /64 lowercase hexadecimal/);
});

test("real OpenTofu encrypts plans, rejects wrong keys and plaintext, and preserves state format", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zoomigo-plan-encryption-"));
  const env = { ...process.env, TF_IN_AUTOMATION: "true" };
  delete env.TF_ENCRYPTION;
  delete env.TF_DATA_DIR;
  const protectedEnv = {
    ...env,
    TF_ENCRYPTION: planEncryption("a".repeat(64)),
  };
  const wrongKey = { ...env, TF_ENCRYPTION: planEncryption("b".repeat(64)) };
  const run = (args, environment = env) =>
    spawnSync("tofu", args, {
      cwd: directory,
      env: environment,
      encoding: "utf8",
      timeout: 30000,
    });
  const pass = (result) => assert.equal(result.status, 0, result.stderr);
  const marker = "private-plan-fixture@invalid.test";
  try {
    await writeFile(
      join(directory, "main.tf"),
      `resource "terraform_data" "fixture" { input = "${marker}" }\n`,
    );
    pass(run(["init", "-backend=false", "-input=false"]));
    pass(run(["plan", "-input=false", "-out=plain.tfplan"]));
    assert.notEqual(run(["show", "plain.tfplan"], protectedEnv).status, 0);
    pass(run(["plan", "-input=false", "-out=private.tfplan"], protectedEnv));
    assert.equal(
      (await readFile(join(directory, "private.tfplan"))).includes(marker),
      false,
    );
    assert.notEqual(run(["show", "private.tfplan"]).status, 0);
    assert.notEqual(run(["show", "private.tfplan"], wrongKey).status, 0);
    assert.notEqual(
      run(["apply", "-input=false", "private.tfplan"], wrongKey).status,
      0,
    );
    const reviewed = run(["show", "-json", "private.tfplan"], protectedEnv);
    pass(reviewed);
    assert.equal(
      JSON.parse(reviewed.stdout).planned_values.root_module.resources[0].values
        .input,
      marker,
    );
    pass(run(["apply", "-input=false", "private.tfplan"], protectedEnv));
    const state = JSON.parse(
      await readFile(join(directory, "terraform.tfstate"), "utf8"),
    );
    assert.equal(state.version, 4);
    pass(run(["show", "-json"]));
    pass(run(["plan", "-input=false", "-out=next.tfplan"], protectedEnv));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
