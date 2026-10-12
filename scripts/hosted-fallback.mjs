export function hostedUnavailable(job, annotations) {
  const ranCode = (job.steps ?? []).some(
    (step) => step.status !== "queued" && step.name !== "Set up job",
  );
  return (
    ["failure", "success"].includes(job.conclusion) &&
    !ranCode &&
    annotations.some(({ message = "" }) =>
      /job was not started.*(?:payments|spending limit|billing|funds|credits)|(?:unable|failed) to (?:acquire|provision|allocate).*runner|runner.*(?:unavailable|capacity)/is.test(
        message,
      ),
    )
  );
}

export default async function fallback({ github, context, core, name }) {
  const { owner, repo } = context.repo;
  const jobs = await github.paginate(
    "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs",
    {
      owner,
      repo,
      run_id: context.runId,
      attempt_number: Number(process.env.GITHUB_RUN_ATTEMPT),
      per_page: 100,
    },
  );
  const matches = jobs.filter(
    (job) => job.name === name && (job.labels ?? []).includes("ubuntu-24.04"),
  );
  if (matches.length !== 1)
    throw new Error("Expected exactly one hosted job in this attempt");
  const job = matches[0];
  if (
    job.conclusion === "success" &&
    (job.steps ?? []).some(
      (step) =>
        step.name === "Record completed build" && step.conclusion === "success",
    ) &&
    !(job.steps ?? []).some((step) => step.conclusion === "failure")
  ) {
    core.setOutput("run", "false");
    return;
  }
  const checkId = Number(job.check_run_url?.match(/\/check-runs\/(\d+)$/)?.[1]);
  if (!checkId)
    throw new Error("Hosted job has no startup diagnostic identity");
  const annotations = await github.paginate(
    "GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations",
    { owner, repo, check_run_id: checkId, per_page: 100 },
  );
  if (!hostedUnavailable(job, annotations)) {
    throw new Error(
      "Hosted job failed after execution or without a billing/capacity startup error; refusing a Mac build retry",
    );
  }
  core.notice(
    "GitHub-hosted startup was blocked; using the approved Mac fallback.",
  );
  core.setOutput("run", "true");
}
