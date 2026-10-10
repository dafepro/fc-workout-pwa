import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function evaluateDrills(input) {
  const checks = [
    ["Container drills", true, input.container],
    ["Release candidate", input.fullRequested, input.releaseCandidate],
    ["Live-host checks", input.hostRequested, input.host],
  ];
  const disabled = input.hostRequested && !input.hostEnabled;
  const passed =
    !disabled &&
    checks.every(([, requested, status]) => !requested || status === "success");
  const complete =
    passed && checks.every(([, , status]) => status === "success");
  const summary = [
    "## Production operations drills",
    "",
    passed
      ? "Requested checks passed."
      : "Requested checks failed or did not run.",
    complete
      ? "Full automated qualification passed."
      : "Full automated qualification is incomplete.",
    "",
    "| Check | Requested | Result |",
    "| --- | --- | --- |",
    ...checks.map(
      ([name, requested, status]) =>
        `| ${name} | ${requested ? "yes" : "no"} | ${["success", "failure", "cancelled", "skipped"].includes(status) ? status : "unknown"} |`,
    ),
    "",
    ...(disabled
      ? [
          "Live-host checks were requested but disabled by PRODUCTION_DRILLS_ENABLED.",
          "",
        ]
      : []),
    "Alert delivery, timed real-archive restore, live cutover rehearsal and the operator incident-release path still require separate evidence before real data.",
    "",
    "Use the job logs and retained log artifacts for failures. Procedures and reproduction commands are in the [production runbook](https://github.com/dafepro/fc-workout-pwa/blob/main/docs/PRODUCTION_RUNBOOK.md#6-prove-production-operations-before-real-data).",
    "",
  ].join("\n");
  return { passed, complete, summary };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = evaluateDrills({
    container: process.env.CONTAINER_DRILLS,
    releaseCandidate: process.env.RELEASE_CANDIDATE,
    host: process.env.HOST_CHECKS,
    fullRequested: process.env.FULL_REQUESTED === "true",
    hostRequested: process.env.HOST_REQUESTED === "true",
    hostEnabled: process.env.DRILLS_ENABLED === "true",
  });
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, result.summary);
  else process.stdout.write(result.summary);
  process.exitCode = result.passed ? 0 : 1;
}
