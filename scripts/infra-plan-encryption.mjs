import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function planEncryption(key) {
  if (!/^[0-9a-f]{64}$/.test(key ?? ""))
    throw Error(
      "TF_PLAN_ENCRYPTION_KEY must contain 64 lowercase hexadecimal characters",
    );
  return `key_provider "pbkdf2" "plan_artifact" {
  passphrase = "${key}"
}
method "aes_gcm" "plan_artifact" {
  keys = key_provider.pbkdf2.plan_artifact
}
plan {
  method = method.aes_gcm.plan_artifact
  enforced = true
}`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const configuration = planEncryption(process.env.TF_PLAN_ENCRYPTION_KEY);
    if (!process.env.GITHUB_ENV) throw Error("GITHUB_ENV is required");
    appendFileSync(
      process.env.GITHUB_ENV,
      `TF_ENCRYPTION<<ZOOMIGO_PLAN_ENCRYPTION\n${configuration}\nZOOMIGO_PLAN_ENCRYPTION\n`,
      { mode: 0o600 },
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
