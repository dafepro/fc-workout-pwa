#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function requireHostname(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9.-]+$/.test(value)) {
    throw new Error(`${label} must be a lowercase DNS hostname`);
  }
  return value;
}

export function configureWorker(
  generated,
  deployment,
  apiBaseURL,
  analyticsDatabaseID = "",
) {
  const apiHostname = requireHostname(deployment.apiHostname, "apiHostname");
  const pwaHostname = requireHostname(deployment.pwaHostname, "pwaHostname");
  if (
    typeof deployment.workerName !== "string" ||
    !/^[a-z0-9-]+$/.test(deployment.workerName)
  ) {
    throw new Error(
      "workerName must contain lowercase letters, digits, and hyphens",
    );
  }
  if (apiBaseURL !== `https://${apiHostname}`) {
    throw new Error(
      `ZOOMIGO_API_BASE_URL (${apiBaseURL}) does not match deployment API hostname (${apiHostname})`,
    );
  }
  if (
    analyticsDatabaseID &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      analyticsDatabaseID,
    )
  ) {
    throw new Error("ANALYTICS_D1_DATABASE_ID must be a UUID");
  }
  const d1Databases = (generated.d1_databases ?? [])
    .filter((database) => database.binding !== "ANALYTICS_DB")
    .concat(
      analyticsDatabaseID
        ? (generated.d1_databases ?? [])
            .filter((database) => database.binding === "ANALYTICS_DB")
            .map((database) => ({
              ...database,
              database_id: analyticsDatabaseID,
            }))
        : [],
    );
  const generatedVars = { ...(generated.vars ?? {}) };
  delete generatedVars.ANALYTICS_SUBJECT_KEY;

  const workerBase = deployment.devAccessEnabled
    ? requireDevBuildConfig(generated)
    : generated;

  const configured = {
    ...workerBase,
    name: deployment.workerName,
    vars: {
      ...(deployment.devAccessEnabled ? {} : generatedVars),
      ZOOMIGO_API_BASE_URL: apiBaseURL,
      ZOOMIGO_REQUIRE_BACKEND: "true",
      PRODUCT_ANALYTICS_ENABLED: analyticsDatabaseID ? "true" : "false",
      ...(deployment.devAccessEnabled
        ? {
            DEV_ACCESS_ENABLED: "true",
            DEV_ALLOWED_REGION_CODES: requireRegionCodes(
              deployment.allowedRegionCodes,
            ),
          }
        : {}),
    },
    d1_databases: d1Databases,
    workers_dev: false,
    routes: [{ pattern: pwaHostname, custom_domain: true }],
  };
  if (!analyticsDatabaseID) {
    delete configured.triggers;
  }
  if (deployment.devAccessEnabled) {
    delete configured.d1_databases;
  }
  return configured;
}

function requireDevBuildConfig(generated) {
  if (generated.main !== "index.js") {
    throw new Error("disposable Worker entry point must be index.js");
  }
  if (generated.assets?.directory !== "../client") {
    throw new Error("disposable Worker assets must come from ../client");
  }
  if (
    typeof generated.compatibility_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(generated.compatibility_date)
  ) {
    throw new Error("disposable Worker compatibility_date is invalid");
  }

  return {
    main: "index.js",
    compatibility_date: generated.compatibility_date,
    compatibility_flags: generated.compatibility_flags ?? [],
    rules: generated.rules ?? [],
    no_bundle: true,
    assets: { directory: "../client", run_worker_first: true },
    observability: { enabled: true },
  };
}

function requireRegionCodes(value) {
  if (Array.isArray(value) && value.length === 1 && value[0] === "*") {
    return "*";
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((region) => !/^[A-Z]{2}$/.test(region))
  ) {
    throw new Error("allowedRegionCodes must contain two-letter region codes");
  }
  return value.join(",");
}

async function main() {
  const [generatedPath, productionPath, apiBaseURL, analyticsDatabaseID] =
    process.argv.slice(2);
  if (!generatedPath || !productionPath || !apiBaseURL) {
    throw new Error(
      "usage: configure-worker.mjs GENERATED_CONFIG PRODUCTION_CONFIG API_BASE_URL",
    );
  }
  const generated = JSON.parse(await readFile(resolve(generatedPath), "utf8"));
  const production = JSON.parse(
    await readFile(resolve(productionPath), "utf8"),
  );
  const configured = configureWorker(
    generated,
    production,
    apiBaseURL,
    analyticsDatabaseID,
  );
  await writeFile(
    resolve(generatedPath),
    `${JSON.stringify(configured, null, 2)}\n`,
    "utf8",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}
