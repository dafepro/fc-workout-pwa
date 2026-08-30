import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function systemRun(command, args) {
  return execFileSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function dispatchDevDeployment(run = systemRun) {
  const branch = run("git", ["branch", "--show-current"]).trim();
  if (!branch) throw new Error("Dev deployment requires a named branch.");

  const changes = run("git", ["status", "--porcelain"]).trim();
  if (changes) {
    throw new Error("Commit every change before dispatching a dev deployment.");
  }

  const revision = run("git", ["rev-parse", "HEAD"]).trim();
  const remote = run("git", [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]).trim();
  if (!remote.startsWith(`${revision}\t`)) {
    throw new Error(`Push ${branch} before dispatching its dev deployment.`);
  }

  return run("gh", [
    "workflow",
    "run",
    "dev.yml",
    "--ref",
    "main",
    "-f",
    "operation=update",
    "-f",
    `ref=${revision}`,
  ]).trim();
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = dispatchDevDeployment();
    process.stdout.write(
      `${result || "Dev deployment dispatched."}\nThe deployment is running asynchronously; this command does not wait.\n`,
    );
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
