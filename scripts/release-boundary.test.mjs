import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("image digest validation accepts only a complete lowercase SHA-256 digest", () => {
  const library = new URL("../deploy/vm/scripts/lib.sh", import.meta.url)
    .pathname;
  for (const [image, valid] of [
    [`ghcr.io/dafepro/fc-workout-pwa/api@sha256:${"a".repeat(64)}`, true],
    ["ghcr.io/dafepro/fc-workout-pwa/api@sha256:abc", false],
    [`ghcr.io/dafepro/fc-workout-pwa/api@sha256:${"A".repeat(64)}`, false],
    ["ghcr.io/dafepro/fc-workout-pwa/api:main", false],
    [`ghcr.io/dafepro/fc-workout-pwa/api@sha256:${"a".repeat(64)};echo`, false],
  ]) {
    const result = spawnSync("sh", [
      "-c",
      '. "$1"; is_image_digest "$2"',
      "test",
      library,
      image,
    ]);
    assert.equal(result.status === 0, valid, image);
  }
});

test("production release refuses a missing prebuilt bundle before contacting a host", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-boundary-"));
  try {
    const marker = join(root, "unexpected-deployment");
    for (const name of ["pnpm", "ssh"])
      await writeFile(
        join(root, name),
        `#!/bin/sh\ntouch '${marker}'\nexit 99\n`,
        { mode: 0o700 },
      );
    const release = new URL("../deploy/release/release.sh", import.meta.url)
      .pathname;
    const result = spawnSync("sh", [release, "a".repeat(40)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        PRODUCTION_RELEASE_DIRECTORY: root,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT.*worker.tgz/);
    await assert.rejects(
      import("node:fs/promises").then(({ access }) => access(marker)),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
