#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");

function fail(message) {
  throw new Error(message);
}

async function exists(path) {
  try {
    await access(resolve(root, path));
    return true;
  } catch {
    return false;
  }
}

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

function repositoryFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    fail(`could not enumerate repository files: ${result.stderr?.trim()}`);
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((path) => path.split(sep).join("/"));
}

const retiredFiles = [
  "docs/ALPHA_FEEDBACK_AVATAR_BUILDER.md",
  "docs/ALPHA_FEEDBACK_AVATAR_BUILDER_ROUND_2.md",
  "docs/CLEAN_MOMENTUM_INTEGRATION.md",
  "docs/COACH_CONSOLE_UX_PLAN.md",
  "docs/FOLLOW_UP.md",
  "docs/FOLLOW_UPS.md",
  "docs/OBSERVABILITY_PLAN.md",
  "docs/STAFF_CONSOLE_DESIGN.md",
  "docs/STAFF_CONSOLE_PROGRESS.md",
  "docs/USER_METRICS_PLAN.md",
  "docs/UX_GOALS.md",
  "docs/backend/API_CONTRACT.md",
  "docs/backend/DATA_MODEL.md",
  ...Array.from(
    { length: 9 },
    (_, index) => `docs/_ALPHA_FEEDBACK_0.${index + 1}.md`,
  ),
  "docs/_ALPHA_FEEDBACK_1.0.md",
  "docs/_ALPHA_FEEDBACK_1.1.md",
];

async function retiredDocumentContract() {
  const remaining = [];
  for (const path of retiredFiles) {
    if (await exists(path)) remaining.push(path);
  }
  if (remaining.length) {
    fail(`retired documentation returned: ${remaining.join(", ")}`);
  }
}

async function indexContract(files) {
  const index = await text("docs/README.md");
  const unindexed = files
    .filter(
      (path) =>
        path.startsWith("docs/") &&
        path.endsWith(".md") &&
        path !== "docs/README.md",
    )
    .filter((path) => !index.includes(`(${path.slice("docs/".length)})`));
  if (unindexed.length) {
    fail(`docs/README.md does not index: ${unindexed.join(", ")}`);
  }

  for (const path of [
    "docs/FUTURE_WORK.md",
    "docs/OBSERVABILITY.md",
    "docs/PRODUCT_ANALYTICS.md",
    "docs/STAFF_CONSOLE.md",
    "docs/backend/API.md",
  ]) {
    if (!(await exists(path))) fail(`missing maintained document: ${path}`);
  }

  const candidate = await text("docs/TEAM_LOUNGE_STARLIGHT_CAMP.md");
  if (!candidate.includes("**Status:** Candidate")) {
    fail("the Starlight proposal must remain explicitly marked Candidate");
  }
}

async function localLinkContract(markdownFiles) {
  const missing = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const path of markdownFiles) {
    const contents = await text(path);
    for (const match of contents.matchAll(linkPattern)) {
      let target = match[1].trim().replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      target = target.split("#", 1)[0].split("?", 1)[0];
      try {
        target = decodeURIComponent(target);
      } catch {
        missing.push(`${path} -> malformed link ${match[1]}`);
        continue;
      }
      const absolute = resolve(root, dirname(path), target);
      try {
        await access(absolute);
      } catch {
        missing.push(
          `${path} -> ${relative(root, absolute).split(sep).join("/")}`,
        );
      }
    }
  }
  if (missing.length)
    fail(`broken local documentation links:\n${missing.join("\n")}`);
}

async function apiInventoryContract() {
  const registrations = (
    await Promise.all([
      text("backend/internal/httpapi/server.go"),
      text("backend/internal/httpapi/staff.go"),
    ])
  ).join("\n");
  const routes = new Set(
    [
      ...registrations.matchAll(
        /mux\.Handle(?:Func)?\("((?:GET|POST|PUT|PATCH|DELETE) [^"]+)"/g,
      ),
    ].map((match) => match[1]),
  );
  const api = await text("docs/backend/API.md");
  const missing = [...routes].filter((route) => !api.includes(route));
  if (missing.length) {
    fail(
      `docs/backend/API.md is missing registered routes: ${missing.join(", ")}`,
    );
  }
}

async function staleClaimContract(markdownFiles) {
  const active = (
    await Promise.all(
      markdownFiles.map(async (path) => [path, await text(path)]),
    )
  ).filter(([path]) => !path.endsWith("AGENTS.md"));
  const forbidden = [
    /Home, Log, Team, Leaders/i,
    /do not implement coach screens/i,
    /current 512 MiB/i,
    /production is[^\n]*512 MiB/i,
    /Chrome 152\.0\.7977\.42/i,
    /(?:all |all current )?(?:thirteen|13) tables/i,
    /ANALYTICS_D1_DATABASE_ID/,
  ];
  const failures = [];
  for (const [path, contents] of active) {
    for (const pattern of forbidden) {
      if (pattern.test(contents)) failures.push(`${path}: ${pattern}`);
    }
    for (const line of contents.split("\n")) {
      if (
        /Cloudflare Access/i.test(line) &&
        !/(does not|not rely|retired|old|without)/i.test(line)
      ) {
        failures.push(`${path}: unqualified current Cloudflare Access claim`);
      }
    }
  }
  if (failures.length)
    fail(`stale documentation claims:\n${failures.join("\n")}`);
}

async function main() {
  const files = repositoryFiles();
  const existingFiles = [];
  for (const path of files) {
    if (await exists(path)) existingFiles.push(path);
  }
  const markdownFiles = existingFiles.filter((path) => path.endsWith(".md"));
  await retiredDocumentContract();
  await indexContract(existingFiles);
  await localLinkContract(markdownFiles);
  await apiInventoryContract();
  await staleClaimContract(markdownFiles);
  console.log("Documentation contract checks passed.");
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
