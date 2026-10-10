import { readFileSync } from "node:fs";

const repository = "dafepro/fc-workout-pwa";
try {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (
    process.env.GITHUB_REPOSITORY !== repository ||
    event.repository?.full_name !== repository
  ) {
    throw new Error("repository is not allowed");
  }
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === "pull_request") {
    if (
      event.pull_request?.head?.repo?.full_name !== repository ||
      event.pull_request?.base?.repo?.full_name !== repository
    ) {
      throw new Error("fork or missing PR repository is not allowed");
    }
  } else if (!["push", "workflow_dispatch", "schedule"].includes(eventName)) {
    throw new Error("event type is not allowed");
  }
  console.log("Runner guard accepted this repository-owned job.");
} catch (error) {
  console.error(`Runner guard refused the job: ${error.message}`);
  process.exitCode = 1;
}
