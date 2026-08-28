import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWorkerUploadFits,
  parseCompressedUploadKiB,
} from "./verify-worker-upload.mjs";

test("reads Wrangler's compressed upload size", () => {
  assert.equal(
    parseCompressedUploadKiB("Total Upload: 6063.23 KiB / gzip: 1642.16 KiB"),
    1642.16,
  );
});

test("keeps headroom below the remote Worker limit", () => {
  assert.doesNotThrow(() => assertWorkerUploadFits(2799.99));
  assert.throws(
    () => assertWorkerUploadFits(2800.01),
    /exceeds the 2800 KiB delivery budget/,
  );
});
