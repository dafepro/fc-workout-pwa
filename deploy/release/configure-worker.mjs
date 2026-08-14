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
  production,
  apiBaseURL,
  analyticsDatabaseID = "",
) {
  const apiHostname = requireHostname(production.apiHostname, "apiHostname");
  const pwaHostname = requireHostname(production.pwaHostname, "pwaHostname");
  if (
    typeof production.workerName !== "string" ||
    !/^[a-z0-9-]+$/.test(production.workerName)
  ) {
    throw new Error(
      "workerName must contain lowercase letters, digits, and hyphens",
    );
  }
  if (apiBaseURL !== `https://${apiHostname}`) {
    throw new Error(
      `ZOOMIGO_API_BASE_URL (${apiBaseURL}) does not match production API hostname (${apiHostname})`,
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

  const configured = {
    ...generated,
    name: production.workerName,
    vars: {
      ...generatedVars,
      ZOOMIGO_API_BASE_URL: apiBaseURL,
      ZOOMIGO_REQUIRE_BACKEND: "true",
      PRODUCT_ANALYTICS_ENABLED: analyticsDatabaseID ? "true" : "false",
    },
    d1_databases: d1Databases,
    workers_dev: false,
    routes: [{ pattern: pwaHostname, custom_domain: true }],
  };
  if (!analyticsDatabaseID) {
    delete configured.triggers;
  }
  return configured;
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
