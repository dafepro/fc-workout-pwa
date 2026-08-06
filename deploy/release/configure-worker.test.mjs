import assert from "node:assert/strict";
import test from "node:test";
import { configureWorker } from "./configure-worker.mjs";

test("configures the production Worker custom domain and API binding", () => {
  const generated = {
    name: "generated-name",
    vars: { KEEP_ME: "yes" },
    workers_dev: true,
  };
  const production = {
    apiHostname: "api.quicktrack.cc",
    pwaHostname: "zoomigo.quicktrack.cc",
    workerName: "zoomigo-training",
  };

  assert.deepEqual(
    configureWorker(generated, production, "https://api.quicktrack.cc"),
    {
      name: "zoomigo-training",
      vars: {
        KEEP_ME: "yes",
        ZOOMIGO_API_BASE_URL: "https://api.quicktrack.cc",
      },
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
