import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintFrom } from "./adopt-host.mjs";

test("fingerprintFrom extracts exactly one SHA256 fingerprint", () => {
  assert.equal(
    fingerprintFrom("256 SHA256:abcDEF123 host (ED25519)"),
    "SHA256:abcDEF123",
  );
  assert.throws(() => fingerprintFrom("no fingerprint"), /exactly one/);
  assert.throws(() => fingerprintFrom("SHA256:one SHA256:two"), /exactly one/);
});
