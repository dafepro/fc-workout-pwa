import { pathToFileURL } from "node:url";
export function dispatchDevDeployment() {
  throw new Error(
    "Hosted dev is retired. Use local development; production releases use dafepro/deploy.",
  );
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    dispatchDevDeployment();
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
