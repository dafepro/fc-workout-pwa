import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Alloy keeps labels, credentials, and buffering bounded", async () => {
  const config = await read("./config.alloy");

  for (const value of [
    'scrape_interval = "30s"',
    "sample_limit    = 500",
    'name   = "label"',
    'values = ["com.docker.compose.project=" + sys.env("COMPOSE_PROJECT_NAME")]',
    'directory = "/alloy-data/textfile"',
    'max_keepalive_time = "2h"',
    'sys.env("GRAFANA_LOGS_TOKEN")',
    'sys.env("GRAFANA_METRICS_TOKEN")',
    "forward_to = [loki.process.safe.receiver]",
    'limit  = "8KiB"',
    "rate  = 12",
  ]) {
    assert.match(
      config,
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.doesNotMatch(config, /trace|profil/i);
  assert.doesNotMatch(config, /player_id|team_id|account_id|request_id\s*=/);

  const labelTargets = [
    ...config.matchAll(/target_label\s*=\s*"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual([...new Set(labelTargets)].sort(), ["service"]);
  assert.match(config, /labels\s*=\s*\{\s*environment\s*=.*release\s*=/s);
  assert.match(config, /stage\.labels\s*\{[\s\S]*level\s*=\s*""/);
});

test("Compose makes the collector private, pinned, and resource gated", async () => {
  const compose = await read("../vm/compose.yaml");
  const alloy = compose.slice(
    compose.indexOf("  alloy:"),
    compose.indexOf("\n  backup:"),
  );

  assert.match(alloy, /image: grafana\/alloy:v1\.18\.1/);
  assert.match(alloy, /profiles:\s*\n\s*- observability/);
  assert.match(alloy, /mem_limit: 96m/);
  assert.match(alloy, /cpus: 0\.20/);
  assert.match(alloy, /pids_limit: 64/);
  assert.match(alloy, /GOMEMLIMIT: 72MiB/);
  assert.match(alloy, /--storage\.path=\/alloy-data/);
  assert.match(alloy, /target: \/alloy-data/);
  assert.match(
    alloy,
    /source: \/var\/run\/docker\.sock[\s\S]*?target: \/var\/run\/docker\.sock[\s\S]*?read_only: true/,
  );
  assert.doesNotMatch(alloy, /\n\s+ports:/);
  assert.doesNotMatch(alloy, /source: \/\s*$/m);
  assert.match(alloy, /networks:\s*\n\s+- edge\s*\n\s+- backend/);
  assert.match(alloy, /\n\s+- backend\s*$/m);
  assert.match(compose, /METRICS_PORT: "9090"/);
  assert.match(compose, /RELEASE_SHA: \$\{APP_VERSION:-manual\}/);
  assert.match(compose, /expose:\s*\n\s+- "8080"\s*\n\s+- "9090"/);
});

test("Deployment enforces host admission before enabling Alloy", async () => {
  const [
    deploy,
    preflight,
    prepareHost,
    library,
    productionCheck,
    hostMetrics,
    throttle,
  ] = await Promise.all([
    read("../vm/scripts/deploy.sh"),
    read("../vm/scripts/observability-preflight.sh"),
    read("../vm/scripts/prepare-host.sh"),
    read("../vm/scripts/lib.sh"),
    read("../vm/scripts/production-check.sh"),
    read("../vm/scripts/write-host-metrics.sh"),
    read("../../backend/internal/httpapi/loginthrottle.go"),
  ]);

  assert.match(deploy, /ENABLE_OBSERVABILITY/);
  assert.match(deploy, /--profile observability/);
  assert.match(preflight, /MemTotal/);
  assert.match(preflight, /900000/);
  assert.match(preflight, /1 GiB VM class/);
  assert.match(preflight, /2097152/);
  assert.match(preflight, /OBSERVABILITY_DATA_DIR/);
  assert.match(prepareHost, /-o 0 -g 0/);
  assert.doesNotMatch(prepareHost, /473/);
  assert.doesNotMatch(library, /473/);
  assert.match(productionCheck, /Alloy container is not running/);
  assert.match(productionCheck, /RestartCount/);
  assert.match(hostMetrics, /zoomigo_container_restart_count/);
  assert.match(hostMetrics, /zoomigo_host_filesystem_avail_bytes/);
  assert.doesNotMatch(throttle, /"client",\s*client/);
});

test("dashboard, paused alerts, and diagnostic workflow cover the reviewed operations", async () => {
  const [dashboardText, alerts, workflow] = await Promise.all([
    read("../../infra/observability/dashboards/backend-overview.json"),
    read("../../infra/observability/alerts/backend.yaml"),
    read("../../.github/workflows/observability-query.yml"),
  ]);
  const dashboard = JSON.parse(dashboardText);
  const titles = dashboard.panels.map((panel) => panel.title);
  for (const title of [
    "Request rate",
    "Error rate",
    "p95 latency",
    "Readiness",
    "Available memory",
    "Disk free",
    "SQLite latency",
    "Backup age",
  ]) {
    assert.ok(titles.includes(title), `missing dashboard panel: ${title}`);
  }
  assert.doesNotMatch(dashboardText, /player_id|team_id|account_id|request_id/);
  for (const rule of [
    "API readiness failing",
    "API 5xx ratio high",
    "Alloy stopped reporting",
    "Disk space low",
    "Backup stale",
  ]) {
    assert.match(alerts, new RegExp(rule));
  }
  assert.match(alerts, /isPaused: true/g);
  assert.match(workflow, /api-errors/);
  assert.match(workflow, /request-id/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /GRAFANA_READ_TOKEN/);
  assert.doesNotMatch(workflow, /ssh|DEPLOY_HOST/i);
});
