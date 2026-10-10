import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyBrowserReport(report) {
  const { expected, skipped, unexpected, flaky } = report.stats ?? {};
  if (
    !Number.isInteger(expected) ||
    expected <= 0 ||
    skipped !== 0 ||
    unexpected !== 0 ||
    flaky !== 0 ||
    (report.errors?.length ?? 0) !== 0
  )
    throw new Error(
      "Browser qualification requires executed passing tests, no skips, errors, or flakes",
    );
  return expected;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const count = verifyBrowserReport(
    JSON.parse(await readFile(process.argv[2], "utf8")),
  );
  console.log(
    `Local Team World browser qualification: ${count} tests passed; no skips.`,
  );
}
