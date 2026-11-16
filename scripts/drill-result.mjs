import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function evaluateDrills(input) {
  const checks = [
    ["Container drills", true, input.container],
    ["Release candidate", input.fullRequested, input.releaseCandidate],
  ];
  const passed = checks.every(
    ([, requested, status]) => !requested || status === "success",
  );
  const summary = [
    "## Production operations drills",
    "",
    passed
      ? "Requested checks passed."
      : "Requested checks failed or did not run.",
    "Live-host qualification runs in dafepro/deploy.",
    "",
    "| Check | Requested | Result |",
    "| --- | --- | --- |",
    ...checks.map(
      ([name, requested, status]) =>
        `| ${name} | ${requested ? "yes" : "no"} | ${["success", "failure", "cancelled", "skipped"].includes(status) ? status : "unknown"} |`,
    ),
    "",
    "Alert delivery, timed real-archive restore, live cutover rehearsal and the operator incident-release path still require separate evidence before real data.",
    "",
    "Use the job logs and retained log artifacts for failures. Procedures and reproduction commands are in the [production runbook](https://github.com/dafepro/fc-workout-pwa/blob/main/docs/PRODUCTION_RUNBOOK.md#6-prove-production-operations-before-real-data).",
    "",
  ].join("\n");
  return { passed, summary };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = evaluateDrills({
    container: process.env.CONTAINER_DRILLS,
    releaseCandidate: process.env.RELEASE_CANDIDATE,
    fullRequested: process.env.FULL_REQUESTED === "true",
  });
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, result.summary);
  else process.stdout.write(result.summary);
  process.exitCode = result.passed ? 0 : 1;
}
