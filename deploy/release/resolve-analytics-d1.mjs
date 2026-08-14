#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_NAME = "zoomigo-product-analytics";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveAnalyticsDatabaseID(databases) {
  if (!Array.isArray(databases)) {
    throw new Error("Wrangler D1 output must be a JSON array");
  }
  const matches = databases.filter(
    (database) => database?.name === DATABASE_NAME,
  );
  if (matches.length === 0) return "";
  if (matches.length !== 1) {
    throw new Error(`expected exactly one D1 database named ${DATABASE_NAME}`);
  }
  const id = matches[0].uuid ?? matches[0].id;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new Error(`${DATABASE_NAME} must have a valid UUID`);
  }
  return id;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const databaseID = resolveAnalyticsDatabaseID(JSON.parse(input));
  process.stdout.write(`${databaseID}\n`);
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
