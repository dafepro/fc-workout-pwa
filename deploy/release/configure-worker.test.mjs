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
