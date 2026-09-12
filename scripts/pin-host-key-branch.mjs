import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function hostKeyBranch(runId, attempt) {
  if (
    !/^[1-9][0-9]{0,19}$/.test(runId ?? "") ||
    !/^[1-9][0-9]{0,4}$/.test(attempt ?? "")
  ) {
    throw new Error("A bounded GitHub run ID and attempt are required.");
  }
  return `codex/host-key-${runId}-${attempt}`;
}

export function publishHostKeyBranch(env, cwd = process.cwd()) {
  const branch = hostKeyBranch(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  if (
    env.GITHUB_REF !== "refs/heads/main" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") ||
    !env.GITHUB_STEP_SUMMARY
  ) {
    throw new Error(
      "Host-key handoff requires a main workflow and GitHub summary context.",
    );
  }
  const options = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const diff = spawnSync(
    "git",
    ["diff", "--quiet", "HEAD", "--", "infra/known_hosts"],
    options,
  );
  if (diff.status === 0) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      "infra/known_hosts already matches the scanned host. No branch was created.\n",
    );
    return;
  }
  if (diff.status !== 1)
    throw new Error("Could not inspect the host-key change.");
  const git = (...args) => execFileSync("git", args, options);
  git("switch", "-c", branch);
  git(
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "--only",
    "-m",
    "chore: review updated Droplet host key",
    "--",
    "infra/known_hosts",
  );
  git("push", "origin", `HEAD:refs/heads/${branch}`);
  const url = `https://github.com/${env.GITHUB_REPOSITORY}/compare/main...${branch}?expand=1`;
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `### Host-key review required\n\n[Review the pin and open its pull request](${url}).\n\nOnly infra/known_hosts was committed on ${branch}; main was not changed. Open the PR as an operator, wait for required CI, and merge it before releasing to the new host. Actions cannot open or approve the PR.\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    publishHostKeyBranch(process.env);
  } catch {
    console.error(
      "Host-key handoff failed; inspect repository state, branch collision, and push permissions.",
    );
    process.exitCode = 1;
  }
}
