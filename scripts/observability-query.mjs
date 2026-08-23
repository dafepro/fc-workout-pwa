import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const environments = new Set(["dev", "production"]);
const windows = new Map([
  ["15m", 15 * 60],
  ["1h", 60 * 60],
  ["6h", 6 * 60 * 60],
  ["24h", 24 * 60 * 60],
]);
const queries = new Set([
  "api-errors",
  "request-id",
  "latency",
  "readiness",
  "resources",
  "canvas",
  "backups",
]);
const requestIdPattern = /^req_[0-9a-f]{24}$/;
const maxRows = 100;
const maxBytes = 64 * 1024;

export function validateInputs(input) {
  if (!environments.has(input.environment))
    throw new Error("environment must be dev or production");
  if (!windows.has(input.window))
    throw new Error("window must be 15m, 1h, 6h, or 24h");
  if (!queries.has(input.query))
    throw new Error("query must be a reviewed preset");
  const requestId = input.requestId ?? "";
  if (input.query === "request-id" && !requestIdPattern.test(requestId)) {
    throw new Error(
      "request ID must match req_ followed by 24 lowercase hexadecimal characters",
    );
  }
  if (requestId && !requestIdPattern.test(requestId)) {
    throw new Error(
      "request ID must match req_ followed by 24 lowercase hexadecimal characters",
    );
  }
  return {
    environment: input.environment,
    window: input.window,
    query: input.query,
    requestId,
  };
}

export function buildQuery(input) {
  const environment = input.environment;
  const templates = {
    "api-errors": {
      signal: "logs",
      expression: `{environment="${environment}",service="api"} | json | msg="http_request_complete" | status >= 500`,
    },
    "request-id": {
      signal: "logs",
      expression: `{environment="${environment}",service="api"} | json | request_id="${input.requestId}"`,
    },
    latency: {
      signal: "metrics",
      expression: `histogram_quantile(0.95, sum by (le,route) (rate(zoomigo_http_request_duration_seconds_bucket{environment="${environment}"}[5m])))`,
    },
    readiness: {
      signal: "metrics",
      expression: `up{environment="${environment}",service=~"api|host"}`,
    },
    resources: {
      signal: "metrics",
      expression: `node_memory_MemAvailable_bytes{environment="${environment}"} or zoomigo_host_filesystem_avail_bytes{environment="${environment}"} or zoomigo_container_restart_count{environment="${environment}"} or rate(node_cpu_seconds_total{environment="${environment}",mode!="idle"}[5m])`,
    },
    canvas: {
      signal: "metrics",
      expression: `{__name__=~"zoomigo_canvas_.*",environment="${environment}"}`,
    },
    backups: {
      signal: "metrics",
      expression: `{__name__=~"zoomigo_(backup|restore_drill)_.*",environment="${environment}"}`,
    },
  };
  return templates[input.query];
}

const safeLogFields = new Set([
  "level",
  "msg",
  "request_id",
  "method",
  "route",
  "status",
  "duration_seconds",
  "response_bytes",
  "error_code",
  "environment",
  "service",
  "release",
]);
const safeMetricLabels = new Set([
  "__name__",
  "environment",
  "service",
  "release",
  "method",
  "route",
  "status_class",
  "code",
  "operation",
  "outcome",
  "surface",
  "kind",
  "quantile",
  "le",
  "device",
  "fstype",
  "mountpoint",
  "mode",
]);

function safeObject(source, allowlist) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (!allowlist.has(key)) continue;
    if (typeof value === "string") result[key] = value.slice(0, 160);
    else if (typeof value === "number" || typeof value === "boolean")
      result[key] = value;
  }
  return result;
}

export function sanitizeResponse(signal, payload) {
  if (payload?.status !== "success" || !Array.isArray(payload?.data?.result)) {
    throw new Error("telemetry provider returned an invalid response");
  }
  const rows = [];
  if (signal === "logs") {
    for (const stream of payload.data.result) {
      for (const [timestamp, line] of stream.values ?? []) {
        if (rows.length === maxRows) break;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        rows.push({
          timestamp: String(timestamp).slice(0, 24),
          labels: safeObject(stream.stream, safeMetricLabels),
          fields: safeObject(parsed, safeLogFields),
        });
      }
      if (rows.length === maxRows) break;
    }
  } else if (signal === "metrics") {
    for (const series of payload.data.result) {
      const samples = Array.isArray(series.values)
        ? series.values
        : series.value
          ? [series.value]
          : [];
      for (const [timestamp, value] of samples) {
        if (rows.length === maxRows) break;
        rows.push({
          labels: safeObject(series.metric, safeMetricLabels),
          timestamp,
          value: String(value).slice(0, 64),
        });
      }
      if (rows.length === maxRows) break;
    }
  } else {
    throw new Error("unknown telemetry signal");
  }
  const available = payload.data.result.reduce(
    (total, series) =>
      total +
      (signal === "logs"
        ? (series.values?.length ?? 0)
        : (series.values?.length ?? (series.value ? 1 : 0))),
    0,
  );
  return { rows, truncated: available > rows.length };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith("--") || argv[index + 1] === undefined)
      throw new Error("arguments must be --name value pairs");
    values[flag.slice(2)] = argv[index + 1];
  }
  return values;
}

async function execute(input, outputPath) {
  const query = buildQuery(input);
  const token = process.env.GRAFANA_READ_TOKEN;
  const prefix = query.signal === "logs" ? "GRAFANA_LOGS" : "GRAFANA_METRICS";
  const endpoint = process.env[`${prefix}_QUERY_URL`];
  const username = process.env[`${prefix}_USERNAME`];
  if (!token || !endpoint || !username)
    throw new Error(`missing ${prefix} read configuration`);
  const end = Math.floor(Date.now() / 1000);
  const start = end - windows.get(input.window);
  const url = new URL(endpoint);
  url.searchParams.set("query", query.expression);
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  url.searchParams.set("limit", String(maxRows));
  if (query.signal === "metrics") url.searchParams.set("step", "30");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`telemetry provider returned HTTP ${response.status}`);
  const result = {
    environment: input.environment,
    window: input.window,
    query: input.query,
    generatedAt: new Date().toISOString(),
    ...sanitizeResponse(query.signal, await response.json()),
  };
  while (
    Buffer.byteLength(JSON.stringify(result)) > maxBytes &&
    result.rows.length
  ) {
    result.rows.pop();
    result.truncated = true;
  }
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const input = validateInputs({
    environment: args.environment,
    window: args.window,
    query: args.query,
    requestId: args["request-id"],
  });
  const output = args.output ?? "observability-result.json";
  const result = await execute(input, output);
  process.stdout.write(
    `Wrote ${result.rows.length} sanitized rows to ${output}${result.truncated ? " (truncated)" : ""}.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`observability query failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
