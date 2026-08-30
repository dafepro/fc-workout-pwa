import assert from "node:assert/strict";
import test from "node:test";

import { dispatchDevDeployment } from "./deploy-dev.mjs";

const revision = "a".repeat(40);

function fakeRun(responses) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    const key = `${command} ${args.join(" ")}`;
    if (!(key in responses)) throw new Error(`Unexpected command: ${key}`);
    return responses[key];
  };
  return { calls, run };
}

test("dispatches the pushed current revision through trusted main and returns immediately", () => {
  const branch = "codex/lounge-ball-recovery";
  const { calls, run } = fakeRun({
    "git branch --show-current": `${branch}\n`,
    "git status --porcelain": "",
    "git rev-parse HEAD": `${revision}\n`,
    [`git ls-remote --heads origin refs/heads/${branch}`]: `${revision}\trefs/heads/${branch}\n`,
    [`gh workflow run dev.yml --ref main -f operation=update -f ref=${revision}`]:
      "https://github.com/example/actions/runs/1\n",
  });

  assert.equal(
    dispatchDevDeployment(run),
    "https://github.com/example/actions/runs/1",
  );
  assert.deepEqual(calls.at(-1), [
    "gh",
    [
      "workflow",
      "run",
      "dev.yml",
      "--ref",
      "main",
      "-f",
      "operation=update",
      "-f",
      `ref=${revision}`,
    ],
  ]);
});

test("refuses an uncommitted worktree", () => {
  const { calls, run } = fakeRun({
    "git branch --show-current": "codex/lounge-ball-recovery\n",
    "git status --porcelain": " M app/page.tsx\n",
  });

  assert.throws(() => dispatchDevDeployment(run), /Commit every change/);
  assert.equal(
    calls.some(([command]) => command === "gh"),
    false,
  );
});

test("refuses a revision that is not the pushed branch head", () => {
  const branch = "codex/lounge-ball-recovery";
  const { calls, run } = fakeRun({
    "git branch --show-current": `${branch}\n`,
    "git status --porcelain": "",
    "git rev-parse HEAD": `${revision}\n`,
    [`git ls-remote --heads origin refs/heads/${branch}`]: `${"b".repeat(40)}\trefs/heads/${branch}\n`,
  });

  assert.throws(() => dispatchDevDeployment(run), /Push .* before dispatching/);
  assert.equal(
    calls.some(([command]) => command === "gh"),
    false,
  );
});
