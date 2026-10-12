import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function authorizeJob(
  repository,
  eventName,
  ref,
  workflow,
  event,
  registeredRepository = "dafepro/deploy",
) {
  if (
    repository !== registeredRepository ||
    event.repository?.full_name !== repository
  )
    throw new Error("only the registered dafepro repository is allowed");
  if (registeredRepository !== "dafepro/deploy") {
    if (
      !["dafepro/fc-workout-pwa", "dafepro/openGym"].includes(
        registeredRepository,
      )
    )
      throw new Error("unapproved app repository");
    if (eventName === "pull_request") {
      if (
        event.pull_request?.head?.repo?.full_name !== repository ||
        event.pull_request?.base?.repo?.full_name !== repository ||
        event.pull_request?.user?.id !== 313492551
      )
        throw new Error(
          "only owner-authored in-repository PR builds are allowed",
        );
      return;
    }
    if (
      eventName === "workflow_dispatch" &&
      event.sender?.id === 313492551 &&
      ref.startsWith("refs/heads/codex/")
    )
      return;
    const branches =
      registeredRepository === "dafepro/openGym"
        ? [
            "refs/heads/main",
            "refs/heads/coach",
            "refs/heads/codex/focused-workout-overlay",
          ]
        : ["refs/heads/main"];
    if (
      eventName === "release" &&
      event.action === "published" &&
      event.release?.author?.id === 313492551 &&
      ref.startsWith("refs/tags/v")
    )
      return;
    if (
      !branches.includes(ref) ||
      !["push", "workflow_dispatch", "schedule"].includes(eventName)
    )
      throw new Error("unapproved app event or branch");
    return;
  }
  if (eventName === "pull_request_target") {
    if (
      ref !== "refs/heads/main" ||
      workflow !== "Validate deployment controller" ||
      event.pull_request?.head?.repo?.full_name !== repository ||
      event.pull_request?.base?.repo?.full_name !== repository ||
      !(
        event.pull_request?.user?.id === 313492551 ||
        event.pull_request?.user?.login === "dafepro-deploy-pr[bot]"
      )
    )
      throw new Error(
        "only trusted-main validation for owner or release App PRs is allowed",
      );
    return;
  }
  if (eventName === "pull_request") {
    if (
      event.pull_request?.head?.repo?.full_name !== repository ||
      event.pull_request?.base?.repo?.full_name !== repository ||
      event.pull_request?.user?.id !== 313492551 ||
      workflow !== "Validate deployment controller"
    )
      throw new Error(
        "only owner-authored in-repository validation PRs are allowed",
      );
    return;
  }
  if (
    eventName === "workflow_dispatch" &&
    workflow === "Validate deployment controller" &&
    event.sender?.id === 313492551 &&
    ref.startsWith("refs/heads/codex/")
  )
    return;
  if (ref !== "refs/heads/main") throw new Error("trusted jobs must use main");
  if (eventName === "issues") {
    if (
      !["opened", "reopened"].includes(event.action) ||
      event.issue?.user?.id !== 313492551 ||
      !event.issue?.title?.startsWith("Release request:") ||
      workflow !== "Turn a verified release request into a deployment PR"
    )
      throw new Error(
        "only owner-issued requests through the trusted handler are allowed",
      );
    return;
  }
  if (!["push", "workflow_dispatch", "schedule"].includes(eventName))
    throw new Error("event type is not allowed");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const policy = new URL("runner-repository.json", import.meta.url);
    authorizeJob(
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_EVENT_NAME,
      process.env.GITHUB_REF,
      process.env.GITHUB_WORKFLOW,
      JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
      existsSync(policy)
        ? JSON.parse(readFileSync(policy, "utf8")).repository
        : "dafepro/deploy",
    );
    console.log("Runner guard accepted the approved deploy job.");
  } catch (error) {
    console.error(`Runner guard refused the job: ${error.message}`);
    process.exitCode = 1;
  }
}
