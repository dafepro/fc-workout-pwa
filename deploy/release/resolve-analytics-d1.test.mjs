import assert from "node:assert/strict";
import test from "node:test";
import { resolveAnalyticsDatabaseID } from "./resolve-analytics-d1.mjs";

test("leaves analytics disabled when the managed database does not exist", () => {
  assert.equal(resolveAnalyticsDatabaseID([]), "");
});

test("returns the UUID of the uniquely named analytics database", () => {
  assert.equal(
    resolveAnalyticsDatabaseID([
      {
        name: "zoomigo-product-analytics",
        uuid: "11111111-1111-4111-8111-111111111111",
      },
    ]),
    "11111111-1111-4111-8111-111111111111",
  );
});

test("refuses duplicate analytics database names", () => {
  assert.throws(
    () =>
      resolveAnalyticsDatabaseID([
        {
          name: "zoomigo-product-analytics",
          uuid: "11111111-1111-4111-8111-111111111111",
        },
        {
          name: "zoomigo-product-analytics",
          uuid: "22222222-2222-4222-8222-222222222222",
        },
      ]),
    /exactly one/,
  );
});

test("refuses a malformed database response", () => {
  assert.throws(
    () =>
      resolveAnalyticsDatabaseID([
        { name: "zoomigo-product-analytics", uuid: "not-a-uuid" },
      ]),
    /valid UUID/,
  );
  assert.throws(() => resolveAnalyticsDatabaseID({}), /JSON array/);
});
