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
  if (profile !== "infrastructure") {
    if (
      !/^sha256:[0-9a-f]{64}$/.test(manifest.apiDigest) ||
      !/^[0-9a-f]{40}$/.test(manifest.controllerSha)
    ) {
      throw new Error(
        "Release manifest requires an immutable image and controller revision",
      );
    }
    if (profile === "production" && manifest.controllerSha !== sha)
      throw new Error(
        "Production bundle must be built by its application revision",
      );
    if (
      profile === "development" &&
      !/^sha256:[0-9a-f]{64}$/.test(manifest.relayDigest)
    ) {
      throw new Error("Development manifest requires an immutable relay image");
    }
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
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Invalid SHA");
  if (profile === "development")
    throw new Error("Development artifacts belong to the same workflow run");
  if (runId === "latest") {
    const runs = await list(
      `actions/runs?head_sha=${sha}&branch=main&status=success`,
      "workflow_runs",
    );
    const file =
      profile === "infrastructure"
        ? ".github/workflows/infra.yml"
        : ".github/workflows/backend-image.yml";
    const producer = runs.find(
      (run) => run.path === file && run.head_sha === sha,
    );
    if (!producer)
      throw new Error("No successful producer exists for the selected SHA");
    runId = String(producer.id);
  }
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
    const metadata = { schema: 2, sha: shaOrRun, profile, checksum: digest };
    if (profile !== "infrastructure") {
      metadata.controllerSha = process.env.CONTROLLER_SHA;
      metadata.apiDigest = process.env.API_DIGEST;
      if (profile === "development")
        metadata.relayDigest = process.env.RELAY_DIGEST;
      validateManifest(metadata, shaOrRun, profile, digest);
    }
    await writeFile(manifestFile, `${JSON.stringify(metadata, null, 2)}\n`);
  } else if (command === "verify") {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    validateManifest(manifest, shaOrRun, profile, digest);
    if (profile !== "infrastructure" && process.env.GITHUB_ENV) {
      const repository = process.env.GITHUB_REPOSITORY;
      if (repository !== "dafepro/fc-workout-pwa")
        throw new Error("Unexpected release repository");
      await appendFile(
        process.env.GITHUB_ENV,
        `API_IMAGE_OVERRIDE=ghcr.io/${repository}/api@${manifest.apiDigest}\n`,
      );
      if (profile === "development")
        await appendFile(
          process.env.GITHUB_ENV,
          `DEV_RELAY_IMAGE=ghcr.io/${repository}/api@${manifest.relayDigest}\n`,
        );
    }
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
