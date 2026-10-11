import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("persistent BuildKit state is scoped to a repository and trusted local runners", async () => {
  const action = await readFile(
    new URL(".github/actions/buildx/action.yml", root),
    "utf8",
  );
  assert.match(
    action,
    /name:.*runner\.environment == 'self-hosted'.*github\.repository_id/,
  );
  assert.match(action, /keep-state:.*runner\.environment == 'self-hosted'/);
  assert.match(action, /cache-binary:.*runner\.environment == 'github-hosted'/);
  assert.match(action, /cleanup: true/);
  assert.match(action, /moby\/buildkit@sha256:[a-f0-9]{64}/);
  assert.match(action, /maxUsedSpace = "6GB"/);
  assert.match(action, /minFreeSpace = "10GB"/);
  assert.match(action, /max-parallelism = 2/);
  assert.doesNotMatch(
    action,
    /allow-insecure-entitlement|docker (?:system|builder|volume) prune/,
  );
});

test("image jobs preserve hosted fallback without local remote-cache transfer", async () => {
  for (const workflow of ["backend-image", "dev"]) {
    const source = await readFile(
      new URL(`.github/workflows/${workflow}.yml`, root),
      "utf8",
    );
    assert.match(source, /id: buildx/);
    const builds = source.split(/uses: docker\/build-push-action@/).slice(1);
    assert.equal(builds.length, workflow === "dev" ? 2 : 1);
    for (const build of builds) {
      assert.match(build, /builder: \$\{\{ steps\.buildx\.outputs\.name \}\}/);
      assert.match(build, /platforms: linux\/amd64/);
      assert.match(build, /provenance: mode=max/);
      assert.match(build, /sbom: true/);
      for (const field of ["cache-from", "cache-to"]) {
        assert.match(
          build,
          new RegExp(
            `${field}:.*runner\\.environment == 'github-hosted'.*type=gha,.*\\|\\| ''`,
          ),
        );
      }
    }
  }
  const ignore = await readFile(new URL("backend/.dockerignore", root), "utf8");
  assert.match(ignore, /^\.env\*$/m);
});
