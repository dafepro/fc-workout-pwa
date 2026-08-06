import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintFrom, updateDeployHost } from "./adopt-host.mjs";

test("host adoption changes only the deployment host", () => {
  const before =
    "DEPLOY_HOST='192.0.2.1'\nDEPLOY_USER='zoomigo'\nOTHER='kept'\n";
  assert.equal(
    updateDeployHost(before, "203.0.113.9"),
    "DEPLOY_HOST='203.0.113.9'\nDEPLOY_USER='zoomigo'\nOTHER='kept'\n",
  );
});

test("host adoption requires one host and one fingerprint", () => {
  assert.throws(
    () => updateDeployHost("DEPLOY_USER=zoomigo\n", "203.0.113.9"),
    /exactly one/,
  );
  assert.throws(
    () => updateDeployHost("DEPLOY_HOST=old\n", "999.0.0.1"),
    /IPv4/,
  );
  assert.equal(
    fingerprintFrom("256 SHA256:abcDEF123 host (ED25519)"),
    "SHA256:abcDEF123",
  );
  assert.throws(() => fingerprintFrom("no fingerprint"), /exactly one/);
});
