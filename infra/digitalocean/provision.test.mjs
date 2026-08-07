import assert from "node:assert/strict";
import test from "node:test";
import { backendConfigArgs, requireEnv } from "./provision.mjs";

test("requireEnv returns a present value and rejects a missing one", () => {
  assert.equal(requireEnv({ TOKEN: "value" }, "TOKEN"), "value");
  assert.throws(() => requireEnv({}, "TOKEN"), /TOKEN must be set/);
});

test("backendConfigArgs builds the R2 state backend flags", () => {
  const args = backendConfigArgs({
    TF_STATE_BUCKET: "zoomigo-tfstate",
    TF_STATE_ENDPOINT: "https://ACCOUNT_ID.r2.cloudflarestorage.com",
    TF_STATE_ACCESS_KEY_ID: "access",
    TF_STATE_SECRET_ACCESS_KEY: "secret",
  });
  assert.deepEqual(args, [
    "-backend-config=bucket=zoomigo-tfstate",
    "-backend-config=key=infra/digitalocean/terraform.tfstate",
    "-backend-config=endpoint=https://ACCOUNT_ID.r2.cloudflarestorage.com",
    "-backend-config=region=auto",
    "-backend-config=use_path_style=true",
    "-backend-config=use_lockfile=true",
    "-backend-config=skip_region_validation=true",
    "-backend-config=skip_credentials_validation=true",
    "-backend-config=skip_requesting_account_id=true",
    "-backend-config=skip_metadata_api_check=true",
    "-backend-config=access_key=access",
    "-backend-config=secret_key=secret",
  ]);
});

test("backendConfigArgs requires every R2 state variable", () => {
  assert.throws(() => backendConfigArgs({}), /TF_STATE_BUCKET must be set/);
});
