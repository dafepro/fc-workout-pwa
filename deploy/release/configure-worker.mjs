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

export function configureWorker(generated, production, apiBaseURL) {
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

  return {
    ...generated,
    name: production.workerName,
    vars: {
      ...(generated.vars ?? {}),
      ZOOMIGO_API_BASE_URL: apiBaseURL,
    },
    workers_dev: false,
    routes: [{ pattern: pwaHostname, custom_domain: true }],
  };
}

async function main() {
  const [generatedPath, productionPath, apiBaseURL] = process.argv.slice(2);
  if (!generatedPath || !productionPath || !apiBaseURL) {
    throw new Error(
      "usage: configure-worker.mjs GENERATED_CONFIG PRODUCTION_CONFIG API_BASE_URL",
    );
  }
  const generated = JSON.parse(await readFile(resolve(generatedPath), "utf8"));
  const production = JSON.parse(
    await readFile(resolve(productionPath), "utf8"),
  );
  const configured = configureWorker(generated, production, apiBaseURL);
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
