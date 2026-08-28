import assert from "node:assert/strict";
import test from "node:test";
import { configureWorker } from "./configure-worker.mjs";

test("configures the production Worker, API, and analytics binding", () => {
  const generated = {
    name: "generated-name",
    vars: { KEEP_ME: "yes", PRODUCT_ANALYTICS_ENABLED: "false" },
    d1_databases: [
      {
        binding: "ANALYTICS_DB",
        database_name: "zoomigo-product-analytics",
        database_id: "00000000-0000-4000-8000-000000000000",
      },
    ],
    triggers: { crons: ["17 5 * * *"] },
    workers_dev: true,
  };
  const production = {
    apiHostname: "api.quicktrack.cc",
    pwaHostname: "zoomigo.quicktrack.cc",
    workerName: "zoomigo-training",
  };

  assert.deepEqual(
    configureWorker(
      generated,
      production,
      "https://api.quicktrack.cc",
      "11111111-1111-4111-8111-111111111111",
    ),
    {
      name: "zoomigo-training",
      vars: {
        KEEP_ME: "yes",
        ZOOMIGO_API_BASE_URL: "https://api.quicktrack.cc",
        ZOOMIGO_REQUIRE_BACKEND: "true",
        PRODUCT_ANALYTICS_ENABLED: "true",
      },
      d1_databases: [
        {
          binding: "ANALYTICS_DB",
          database_name: "zoomigo-product-analytics",
          database_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
      triggers: { crons: ["17 5 * * *"] },
      workers_dev: false,
      routes: [
        {
          pattern: "zoomigo.quicktrack.cc",
          custom_domain: true,
        },
      ],
    },
  );
});

test("leaves analytics disabled and removes the placeholder without a database", () => {
  const configured = configureWorker(
    {
      vars: { PRODUCT_ANALYTICS_ENABLED: "true" },
      d1_databases: [
        {
          binding: "ANALYTICS_DB",
          database_id: "00000000-0000-4000-8000-000000000000",
        },
      ],
      triggers: { crons: ["17 5 * * *"] },
    },
    {
      apiHostname: "api.quicktrack.cc",
      pwaHostname: "zoomigo.quicktrack.cc",
      workerName: "zoomigo-training",
    },
    "https://api.quicktrack.cc",
    "",
  );
  assert.equal(configured.vars.PRODUCT_ANALYTICS_ENABLED, "false");
  assert.deepEqual(configured.d1_databases, []);
  assert.equal(configured.triggers, undefined);
});

test("rejects a mismatched public API origin", () => {
  assert.throws(
    () =>
      configureWorker(
        {},
        {
          apiHostname: "api.quicktrack.cc",
          pwaHostname: "zoomigo.quicktrack.cc",
          workerName: "zoomigo-training",
        },
        "https://other.example.test",
      ),
    /does not match/,
  );
});

test("configures the disposable Worker with its shared password gate", () => {
  const configured = configureWorker(
    {
      main: "index.js",
      compatibility_date: "2026-05-15",
      compatibility_flags: ["nodejs_compat"],
      assets: { directory: "../client" },
      observability: { enabled: true },
      vars: { UNTRUSTED_BRANCH_VALUE: "must-not-survive" },
      d1_databases: [
        {
          binding: "PRODUCTION_DATA",
          database_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
      kv_namespaces: [{ binding: "PRODUCTION_CACHE", id: "secret-id" }],
      r2_buckets: [{ binding: "PRODUCTION_BACKUPS", bucket_name: "backups" }],
      services: [{ binding: "PRODUCTION_SERVICE", service: "production" }],
      triggers: { crons: ["* * * * *"] },
      routes: [{ pattern: "zoomigo.quicktrack.cc", custom_domain: true }],
    },
    {
      apiHostname: "api-dev.zoomigo.quicktrack.cc",
      pwaHostname: "dev.zoomigo.quicktrack.cc",
      workerName: "zoomigo-training-dev",
      devAccessEnabled: true,
    },
    "https://api-dev.zoomigo.quicktrack.cc",
  );

  assert.equal(configured.vars.DEV_ACCESS_ENABLED, "true");
  assert.equal(configured.vars.DEV_ALLOWED_REGION_CODES, undefined);
  assert.equal(configured.vars.UNTRUSTED_BRANCH_VALUE, undefined);
  assert.equal(configured.d1_databases, undefined);
  assert.equal(configured.kv_namespaces, undefined);
  assert.equal(configured.r2_buckets, undefined);
  assert.equal(configured.services, undefined);
  assert.equal(configured.triggers, undefined);
  assert.equal(configured.main, "index.js");
  assert.deepEqual(configured.assets, { directory: "../client" });
  assert.deepEqual(configured.routes, [
    { pattern: "dev.zoomigo.quicktrack.cc", custom_domain: true },
  ]);
});
