import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  packPlaintextDirectory,
  unpackPortableBundle,
} from "./manage-production-secrets.mjs";

const requiredFiles = {
  "backup-s3.env": "BACKUP_S3_ENDPOINT=https://unit.r2.cloudflarestorage.com\n",
  "cloudflare.env": "CLOUDFLARE_ACCOUNT_ID=unit-account\n",
  "deploy.env":
    "DEPLOY_HOST=deploy.quicktrack.cc\nDEPLOY_USER=zoomigo\nZOOMIGO_API_BASE_URL=https://api.quicktrack.cc\n",
  deploy_ssh_key: "synthetic-key-for-bundle-unit-test\n",
  known_hosts: "deploy.quicktrack.cc ssh-ed25519 AAAAC3NzaSyntheticUnitTest\n",
};

test("portable deployment bundle round trips without a tar implementation", async () => {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-portable-bundle-test-"));
  const source = join(root, "source");
  const output = join(root, "output");
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(source, { mode: 0o700 });
    for (const [name, contents] of Object.entries(requiredFiles)) {
      await writeFile(join(source, name), contents, { mode: 0o600 });
    }

    const bundle = await packPlaintextDirectory(source);
    await unpackPortableBundle(bundle, output);

    for (const [name, contents] of Object.entries(requiredFiles)) {
      assert.equal(await readFile(join(output, name), "utf8"), contents);
    }
    if (process.platform !== "win32") {
      assert.equal((await stat(output)).mode & 0o777, 0o700);
      assert.equal(
        (await stat(join(output, "deploy.env"))).mode & 0o777,
        0o600,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("portable bundle refuses a changed required-file set", async () => {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-portable-bundle-test-"));
  try {
    const source = join(root, "source");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(source);
    for (const [name, contents] of Object.entries(requiredFiles)) {
      await writeFile(join(source, name), contents);
    }
    await writeFile(join(source, "extra.env"), "unexpected=true\n");

    await assert.rejects(
      packPlaintextDirectory(source),
      /unexpected file layout/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("portable bundle refuses path traversal before creating output", async () => {
  const root = await mkdtemp(join(tmpdir(), "zoomigo-portable-bundle-test-"));
  try {
    const source = join(root, "source");
    const output = join(root, "output");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(source);
    for (const [name, contents] of Object.entries(requiredFiles)) {
      await writeFile(join(source, name), contents);
    }
    const validBundle = await packPlaintextDirectory(source);
    const document = JSON.parse(gunzipSync(validBundle).toString("utf8"));
    document.files[0].name = "../outside.env";
    const changedBundle = gzipSync(Buffer.from(JSON.stringify(document)));

    await assert.rejects(
      unpackPortableBundle(changedBundle, output),
      /unexpected file layout/,
    );
    await assert.rejects(stat(output), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
