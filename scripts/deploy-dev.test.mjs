import assert from "node:assert/strict";
import test from "node:test";
import { dispatchDevDeployment } from "./deploy-dev.mjs";
test("retired hosted dev rejects deployment before any command runs", () => {
  let calls = 0;
  assert.throws(
    () =>
      dispatchDevDeployment(() => {
        calls++;
      }),
    /retired/,
  );
  assert.equal(calls, 0);
});
