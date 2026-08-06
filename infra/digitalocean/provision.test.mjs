import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "./provision.mjs";

test("environment parser accepts comments, exports, and quoted values", () => {
  assert.deepEqual(
    parseEnvironment(
      "# provider credentials\nexport CLOUDFLARE_API_TOKEN='token-value'\nOTHER=plain\n",
    ),
    { CLOUDFLARE_API_TOKEN: "token-value", OTHER: "plain" },
  );
});

test("environment parser rejects shell syntax and duplicates", () => {
  assert.throws(() => parseEnvironment("source .env\n"), /line 1/);
  assert.throws(() => parseEnvironment("TOKEN=one\nTOKEN=two\n"), /duplicate/);
  assert.throws(() => parseEnvironment("TOKEN=\n"), /invalid value/);
});
