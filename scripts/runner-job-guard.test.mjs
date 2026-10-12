import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repository = "dafepro/fc-workout-pwa";
function run(eventName, payload, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "runner-guard-"));
  try {
    const eventPath = join(directory, "event.json");
    writeFileSync(eventPath, JSON.stringify(payload));
    return spawnSync(process.execPath, ["scripts/runner-job-guard.mjs"], {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REF: "refs/heads/main",
        ...environment,
      },
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const trusted = { repository: { full_name: repository } };
for (const event of ["push", "workflow_dispatch", "schedule"]) {
  test(`allows trusted ${event}`, () =>
    assert.equal(run(event, trusted).status, 0));
}
function pullRequest(headRepository) {
  return {
    ...trusted,
    pull_request: {
      user: { id: 313492551 },
      head: { repo: headRepository && { full_name: headRepository } },
      base: { repo: { full_name: repository } },
    },
  };
}
test("allows a repository-owned PR", () => {
  assert.equal(run("pull_request", pullRequest(repository)).status, 0);
});
for (const head of ["attacker/fc-workout-pwa", null]) {
  test(`rejects PR head ${head}`, () => {
    assert.notEqual(run("pull_request", pullRequest(head)).status, 0);
  });
}
for (const event of ["pull_request_target", "workflow_run", "unknown"]) {
  test(`rejects ${event}`, () =>
    assert.notEqual(run(event, trusted).status, 0));
}
test("rejects missing or wrong payload repository", () => {
  assert.notEqual(run("push", {}).status, 0);
  assert.notEqual(
    run("push", { repository: { full_name: "other/repo" } }).status,
    0,
  );
});
test("rejects wrong environment repository", () => {
  assert.notEqual(
    run("push", trusted, { GITHUB_REPOSITORY: "other/repo" }).status,
    0,
  );
});
test("rejects unreadable event payload", () => {
  assert.notEqual(
    run("push", trusted, { GITHUB_EVENT_PATH: "/nonexistent/event.json" })
      .status,
    0,
  );
});

test("rejects another owned repository on this fixed registration", () => {
  const otherRepository = "dafepro/zmap";
  assert.notEqual(
    run(
      "push",
      { repository: { full_name: otherRepository } },
      { GITHUB_REPOSITORY: otherRepository },
    ).status,
    0,
  );
});
test("rejects a matching repository belonging to a different account", () => {
  const otherRepository = "attacker/zmap";
  assert.notEqual(
    run(
      "push",
      { repository: { full_name: otherRepository } },
      { GITHUB_REPOSITORY: otherRepository },
    ).status,
    0,
  );
});

test("rejects an internal PR on another registration", () => {
  const other = "dafepro/zmap";
  assert.notEqual(
    run(
      "pull_request",
      {
        repository: { full_name: other },
        pull_request: {
          head: { repo: { full_name: other } },
          base: { repo: { full_name: other } },
        },
      },
      { GITHUB_REPOSITORY: other },
    ).status,
    0,
  );
});
test("rejects a PR from a different repository under the same owner", () => {
  assert.notEqual(run("pull_request", pullRequest("dafepro/zmap")).status, 0);
});
