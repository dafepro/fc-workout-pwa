import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuery,
  buildRangeParameters,
  sanitizeResponse,
  validateInputs,
} from "./observability-query.mjs";

test("range timestamps use each provider's required unit", () => {
  assert.deepEqual(
    buildRangeParameters("metrics", 1_700_000_000, 1_700_000_900),
    {
      start: "1700000000",
      end: "1700000900",
    },
  );
  assert.deepEqual(buildRangeParameters("logs", 1_700_000_000, 1_700_000_900), {
    start: "1700000000000000000",
    end: "1700000900000000000",
  });
});

test("inputs are closed enums with a bounded request ID", () => {
  assert.deepEqual(
    validateInputs({ environment: "dev", window: "1h", query: "latency" }),
    {
      environment: "dev",
      window: "1h",
      query: "latency",
      requestId: "",
    },
  );
  assert.throws(
    () =>
      validateInputs({
        environment: "staging",
        window: "1h",
        query: "latency",
      }),
    /environment/,
  );
  assert.throws(
    () =>
      validateInputs({ environment: "dev", window: "7d", query: "latency" }),
    /window/,
  );
  assert.throws(
    () =>
      validateInputs({
        environment: "dev",
        window: "1h",
        query: "up or vector(1)",
      }),
    /query/,
  );
  assert.throws(
    () =>
      validateInputs({
        environment: "dev",
        window: "1h",
        query: "request-id",
        requestId: "req_secret",
      }),
    /request ID/,
  );
  assert.throws(
    () =>
      validateInputs({ environment: "dev", window: "1h", query: "request-id" }),
    /request ID/,
  );
});

test("reviewed templates never interpolate arbitrary query text", () => {
  const latency = buildQuery(
    validateInputs({
      environment: "production",
      window: "15m",
      query: "latency",
    }),
  );
  assert.equal(latency.signal, "metrics");
  assert.match(latency.expression, /environment="production"/);
  assert.match(
    latency.expression,
    /zoomigo_http_request_duration_seconds_bucket/,
  );

  const request = buildQuery(
    validateInputs({
      environment: "dev",
      window: "1h",
      query: "request-id",
      requestId: "req_0123456789abcdef01234567",
    }),
  );
  assert.equal(request.signal, "logs");
  assert.match(request.expression, /req_0123456789abcdef01234567/);
});

test("log sanitization keeps only reviewed fields and caps rows", () => {
  const values = Array.from({ length: 120 }, (_, index) => [
    String(1_700_000_000_000_000_000 + index),
    JSON.stringify({
      level: "ERROR",
      msg: "http_request_complete",
      request_id: "req_0123456789abcdef01234567",
      method: "GET",
      route: "/v1/training-entries/{entryId}",
      status: 500,
      error_code: "internal_error",
      authorization: "Bearer secret",
      playerId: "private-player",
    }),
  ]);
  const sanitized = sanitizeResponse("logs", {
    status: "success",
    data: {
      resultType: "streams",
      result: [{ stream: { service: "api", secret: "no" }, values }],
    },
  });

  assert.equal(sanitized.rows.length, 100);
  assert.equal(sanitized.truncated, true);
  assert.deepEqual(Object.keys(sanitized.rows[0].fields).sort(), [
    "error_code",
    "level",
    "method",
    "msg",
    "request_id",
    "route",
    "status",
  ]);
  assert.doesNotMatch(
    JSON.stringify(sanitized),
    /private-player|Bearer secret|authorization/,
  );
});

test("metric sanitization removes unexpected labels and payload fields", () => {
  const sanitized = sanitizeResponse("metrics", {
    status: "success",
    data: {
      resultType: "matrix",
      result: [
        {
          metric: {
            __name__: "up",
            environment: "dev",
            service: "api",
            instance: "private-host",
            player_id: "private",
          },
          values: [[1_700_000_000, "1"]],
          exemplars: [{ labels: { request_id: "secret" } }],
        },
      ],
    },
  });

  assert.deepEqual(sanitized.rows, [
    {
      labels: { __name__: "up", environment: "dev", service: "api" },
      timestamp: 1_700_000_000,
      value: "1",
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(sanitized),
    /private-host|player_id|exemplars|request_id/,
  );
});
