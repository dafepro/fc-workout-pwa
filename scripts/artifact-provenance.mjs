import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function validateProducer(run, jobs, artifacts, expected) {
  if (
    run.repository?.full_name !== expected.repository ||
    run.head_repository?.full_name !== expected.repository ||
    run.path !== expected.workflow ||
    run.workflow_id !== expected.workflowId ||
    run.head_branch !== "main" ||
    run.head_sha !== expected.sha ||
    !expected.events.includes(run.event) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !jobs.some(
      (job) => job.name === expected.job && job.conclusion === "success",
    )
  )
    throw new Error(
      "Artifact producer is not the successful expected main workflow/job/SHA",
    );
  const matches = artifacts.filter(
    (artifact) => artifact.name === expected.artifact && !artifact.expired,
  );
  if (matches.length !== 1)
    throw new Error("Expected exactly one unexpired artifact");
  return matches[0];
}

export function validateManifest(manifest, sha, profile, checksum) {
  if (
    manifest.schema !== 2 ||
    manifest.sha !== sha ||
    manifest.profile !== profile ||
    manifest.checksum !== checksum
  ) {
    throw new Error(
      "Artifact manifest version, revision, profile or checksum mismatch",
    );
  }
}

async function checksum(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function api(path) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok)
    throw new Error(`GitHub provenance request failed (${response.status})`);
  return response.json();
}

async function list(path, field) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const result = await api(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    rows.push(...result[field]);
    if (result[field].length < 100) return rows;
  }
  throw new Error("Provenance metadata exceeds bounded pagination");
}

async function resolve(profile, runId, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^\d+$/.test(runId))
    throw new Error("Invalid SHA or run ID");
  const workflowFile =
    profile === "infrastructure" ? "infra.yml" : "backend-image.yml";
  const [workflow, run] = await Promise.all([
    api(`actions/workflows/${workflowFile}`),
    api(`actions/runs/${runId}`),
  ]);
  const expected = {
    repository: process.env.GITHUB_REPOSITORY,
    workflow: `.github/workflows/${workflowFile}`,
    workflowId: workflow.id,
    sha,
    job:
      profile === "infrastructure"
        ? "tofu plan"
        : "Publish immutable GHCR image",
    artifact:
      profile === "infrastructure"
        ? `tfplan-v2-${run.run_attempt}`
        : `production-release-${sha}-${run.run_attempt}`,
    events:
      profile === "infrastructure"
        ? ["workflow_dispatch"]
        : ["push", "workflow_dispatch"],
  };
  const [jobs, artifacts] = await Promise.all([
    list(`actions/runs/${runId}/attempts/${run.run_attempt}/jobs`, "jobs"),
    list(`actions/runs/${runId}/artifacts`, "artifacts"),
  ]);
  const artifact = validateProducer(run, jobs, artifacts, expected);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `artifact-id=${artifact.id}\nrun-id=${runId}\n`,
  );
}

async function main() {
  const [command, profile, shaOrRun, payloadOrSha, manifestFile] =
    process.argv.slice(2);
  if (!["infrastructure", "production", "development"].includes(profile))
    throw new Error("Invalid artifact profile");
  if (command === "resolve") return resolve(profile, shaOrRun, payloadOrSha);
  if (!/^[0-9a-f]{40}$/.test(shaOrRun))
    throw new Error("Invalid artifact revision");
  const digest = await checksum(payloadOrSha);
  if (command === "create") {
    await writeFile(
      manifestFile,
      `${JSON.stringify({ schema: 2, sha: shaOrRun, profile, checksum: digest }, null, 2)}\n`,
    );
  } else if (command === "verify") {
    validateManifest(
      JSON.parse(await readFile(manifestFile, "utf8")),
      shaOrRun,
      profile,
      digest,
    );
  } else throw new Error("Invalid artifact command");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
