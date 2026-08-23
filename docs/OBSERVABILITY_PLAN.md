# Backend observability plan

## Outcome

Give the product owner a durable Grafana view of backend health, logs, and
alerts, while giving Codex a repeatable read-only diagnostic path through
GitHub Actions. Observability must survive replacement of the disposable dev
Droplet and must not expose the API, SQLite database, Docker socket, or SSH to
the public internet.

## Current state

- The Go API writes a few `slog` startup and rate-limit messages to standard
  output, but it has no request log middleware.
- API and Caddy container logs use Docker's bounded local driver: three 5 MB
  files. They exist only on the VM and disappear with a disposable host.
- SSH is deliberately restricted to deployment-runner addresses. That is why a
  local Codex session can read GitHub deployment logs but cannot tail the live
  containers.
- `/healthz` and `/readyz` exist, but there is no Prometheus/OpenMetrics
  endpoint. `/api/metrics` in the PWA is product-event ingestion, not backend
  operational telemetry.
- The Cloudflare Worker enables provider observability, but that does not
  collect the origin API's container logs or process metrics.

## Recommended architecture

Use one managed Grafana Cloud stack with Loki for logs and Prometheus/Mimir for
metrics. Run a pinned Grafana Alloy collector on each ZoomiGo VM. This keeps
history outside the Droplet, gives the owner a normal dashboard and Explore UI,
and uses one small collector for both signals.

```text
Go API JSON stdout ──> bounded Docker logs ──> Grafana Alloy ──> Loki
Go API :9090/metrics ────────────────────────> Grafana Alloy ──> Prometheus/Mimir
                                                        │
                                    Grafana dashboards + managed alerts
                                                        │
                    owner Viewer login <───────────────┴──> read-only query workflow
```

The API metrics listener is exposed only on the internal Compose network. Alloy
publishes no port. Grafana credentials are runtime secrets, never image layers,
repository files, job summaries, or command output.

Grafana's current documentation supports Docker log collection with
`loki.source.docker`, Prometheus scraping with `prometheus.scrape`, and durable
remote write with a local WAL. Cloud Access Policies provide separate
`logs:write`, `metrics:write`, `logs:read`, and `metrics:read` machine scopes.

## Host resource budget and admission gate

Observability is subordinate to application availability. The current VM sizes
are materially different:

- dev is `s-1vcpu-1gb` (1 vCPU and 1 GiB RAM);
- production is `s-1vcpu-512mb-10gb` (1 vCPU, 512 MiB RAM, 10 GiB disk);
- the continuously running API and Caddy containers already have 256 MiB and
  96 MiB memory limits. Their 352 MiB combined ceiling excludes the host OS,
  Docker, security updates, and transient deployment work.

The first Alloy configuration is intentionally small: logs and metrics only,
no traces or profiles, at most 500 active application series, a 30-second scrape
interval, fixed route templates, and no Kubernetes or cloud-service discovery.
Its initial container budget is:

| Resource             | Hard/operating budget                                       |
| -------------------- | ----------------------------------------------------------- |
| Container memory     | `mem_limit: 96m`; `GOMEMLIMIT=72MiB`                        |
| CPU                  | `cpus: 0.20`; sustained p95 below 10% of the single vCPU    |
| Processes            | `pids_limit: 64`                                            |
| Local telemetry data | 256 MiB allocation target; remote-write WAL retained <= 2 h |
| Log input            | <= 100 KiB/s sustained; existing Docker logs remain bounded |
| Network egress       | <= 128 KiB/s p95 outside a recovery flush                   |

Grafana's published estimates scale mainly with active series and log ingress,
but explicitly warn that per-node fixed overhead and real configuration can
change the result. These numbers are therefore ceilings to prove in dev, not a
claim that Alloy always fits in 96 MiB.

### Capacity decision

Co-located Alloy is **not admitted on the current 512 MiB production Droplet**.
Adding a 96 MiB collector to the existing 352 MiB container ceilings leaves at
most 64 MiB for the host and Docker, before deployment spikes. Production must
first either:

1. move to at least the same 1 GiB class as dev; or
2. adopt a reviewed non-co-located collection path that does not expose Docker,
   SQLite, the metrics listener, or an administrative port publicly.

Do not reduce the API's current safety limit to make the collector fit. Managed
Grafana hosts the UI and data stores; only the small Alloy collector is proposed
for the application VM.

### Measured admission test

Before enabling Alloy in either environment:

1. Record a 24-hour baseline for host available memory, swap-in rate, CPU, disk,
   API p95 latency, and container restarts under representative traffic.
2. Start Alloy in dev with the limits above and synthetic safe logs/metrics.
3. Exercise normal traffic plus a deploy, backup, remote-write outage, and
   recovery flush for at least 24 hours.
4. Require at least 256 MiB host `MemAvailable` at idle, at least 128 MiB during
   the worst test, no OOM/restart, under 1 MiB/hour swap-in after warm-up, at
   least 2 GiB free disk, and no material readiness or latency regression.
5. Fail deployment if the VM is below 1 GiB RAM, disk headroom is below 2 GiB,
   the configured series/log budgets are exceeded, or Compose lacks the memory,
   CPU, PID, and bounded-storage settings.
6. Automatically stop and roll back Alloy—not the API—if available memory stays
   below 128 MiB, disk reaches 70%, Alloy repeatedly restarts, or API readiness
   regresses during rollout.

This test must be rerun after enabling a new telemetry signal, materially adding
routes or labels, changing scrape frequency, or resizing either Droplet.

## Privacy-safe logging contract

Add an HTTP middleware outside the existing request-ID middleware. Emit one
structured JSON completion event per request with only:

- timestamp, level, service, environment, release SHA, request ID;
- HTTP method, route template, status code, duration, and response bytes;
- predefined application error code when present;
- predefined outcome fields for backup, authentication throttling, and Team
  Canvas connection lifecycle.

Never emit:

- request or response bodies, query strings, cookies, bearer tokens, QR
  credentials, PINs, email addresses, or TOTP data;
- player, account, club, or team identifiers;
- raw URL parameters, free text, workout results, effort, tiredness, assessment
  data, avatar configuration, or stamp contents;
- raw client IP addresses in exported logs.

The existing raw rate-limit client value should be replaced with a rotating
keyed pseudonym or dropped before export. Alloy should also apply a final deny
and redaction stage before `loki.write`; this is defense in depth, not a reason
to log sensitive fields at the source. Loki labels stay low-cardinality:
`environment`, `service`, `level`, and `release` only. Request IDs and error
codes remain parsed fields, not index labels.

## Metrics contract

Expose a second internal listener using the official Prometheus Go client. The
initial bounded metric set is:

- `zoomigo_http_requests_total{method,route,status_class}`;
- `zoomigo_http_request_duration_seconds{method,route}`;
- `zoomigo_http_requests_in_flight`;
- `zoomigo_errors_total{code,route}`;
- `zoomigo_sqlite_operations_total{operation,outcome}` and a duration
  histogram for predefined operation groups;
- `zoomigo_auth_attempts_total{surface,outcome}` with aggregate outcomes only;
- `zoomigo_canvas_connections` and predefined message/error counters;
- `zoomigo_build_info{version}`;
- standard Go process/runtime metrics;
- Alloy host metrics for CPU, memory, filesystem usage, and container restarts;
- backup last-success age and last restore-drill result.

Do not label a metric with a request ID, URL, IP address, player/team/account ID,
or other unbounded value. The route label uses registered templates such as
`/v1/training-entries/{entryId}`, never the actual path.

## Human access

- The owner receives a Grafana `Viewer` account with MFA and no data-source or
  dashboard mutation rights.
- A separate administrative account provisions dashboards, alert rules, and
  access policies. It is not used for ordinary viewing.
- Start with two folders, `ZoomiGo Dev` and `ZoomiGo Production`, backed by the
  same provisioned dashboard definitions and filtered by environment.
- Recommended first dashboard panels: request rate, error rate, p50/p95/p99
  latency, top safe error codes, readiness, container restarts, memory, disk,
  SQLite operation latency, active canvas connections, and backup age.

## Codex access

Agent use: dispatch `observability-query` for dev or production, choose a preset
and window, then download the sanitized artifact; never query droplets directly.

Do not put a Grafana token in a developer shell or ask Codex to use the owner's
browser session. Add a manual `observability-query.yml` workflow with enumerated
inputs:

- environment: `dev` or `production`;
- time window: `15m`, `1h`, `6h`, or `24h`;
- query: `api-errors`, `request-id`, `latency`, `readiness`, `resources`,
  `canvas`, or `backups`;
- optional request ID, validated as the existing bounded hexadecimal format.

The workflow uses a production-environment secret containing a stack-scoped
Grafana Cloud Access Policy token with only `logs:read` and `metrics:read`. A
repository script maps each input to a reviewed LogQL or PromQL template,
queries the data APIs, removes unexpected fields, caps rows and bytes, and
uploads a short-lived JSON artifact plus a compact job summary.

Codex already has read access to workflow runs and artifacts through the repo's
GitHub credential. It can therefore dispatch a predefined diagnostic and read
the sanitized result without SSH, owner credentials, or arbitrary query access.
The product owner can use either this same workflow or Grafana directly.

## Alerts

Provision alerts as code after a week of dev baselining:

- readiness failing for two consecutive minutes;
- 5xx ratio over a conservative threshold for five minutes;
- p95 request latency above the agreed budget for ten minutes;
- repeated container restarts or Alloy stopped reporting;
- disk space below 15%;
- backup age over 26 hours or a failed restore drill;
- sustained SQLite busy/internal-error activity.

Route first to owner email. Additional destinations remain a product/operator
decision. Alerts must link to the filtered dashboard and include environment,
release, time window, and safe error code—not request bodies or identities.

## Implementation sequence and proposed files

### 1. Structured logs

```text
backend/internal/observability/logging.go
backend/internal/observability/logging_test.go
backend/internal/httpapi/server.go
backend/cmd/api/main.go
```

Configure `slog.NewJSONHandler`, add the request completion middleware, enforce
the allowlisted field contract in tests, and pass the release SHA into the API
binary.

### 2. Operational metrics

```text
backend/internal/observability/metrics.go
backend/internal/observability/metrics_test.go
backend/cmd/api/main.go
backend/internal/config/config.go
deploy/vm/compose.yaml
```

Run a separate metrics server on the backend network, register a private
registry, and test route normalization and label cardinality. No public Caddy or
Cloudflare route is added.

### 3. Collector and secrets

```text
deploy/observability/config.alloy
deploy/observability/config_test.mjs
deploy/vm/compose.yaml
deploy/vm/.env.example
deploy/release/deploy-vm.sh
deploy/release/deploy-dev.sh
```

Add a pinned, hardened Alloy service with a persistent WAL/positions volume,
read-only configuration, no published port, minimal memory/CPU limits, and
separate write credentials for logs and metrics. Contract-test the pipeline
against local in-memory Loki and remote-write fakes; default tests must not
contact Grafana Cloud.

### 4. Dashboards, alerts, and Codex query path

```text
infra/observability/dashboards/backend-overview.json
infra/observability/alerts/backend.yaml
.github/workflows/observability-query.yml
scripts/observability-query.mjs
scripts/observability-query.test.mjs
```

Provision reviewed dashboards and alerts. The query workflow accepts only the
enumerated templates above, caps output, and never prints credentials.

### 5. Rollout

1. Create the managed stack and four scoped credentials: dev write, production
   write, read-only diagnostic, and dashboard provisioning.
2. Ship logs and metrics to dev; verify redaction with synthetic forbidden
   values before any real review data is used.
3. Run for seven days, set alert thresholds from observed baselines, and conduct
   a token-rotation and telemetry-outage drill.
4. Ship the identical instrumentation and dashboards to production with a
   separate environment label and write credential.
5. Document incident queries and credential rotation in the operator runbook.

## Decisions required before implementation

- Approve Grafana Cloud as the managed telemetry destination, or select another
  Loki/Prometheus-compatible provider.
- Choose log and metric retention within the selected plan; recommended starting
  targets are 14 days for dev and 30 days for production.
- Choose the initial alert destination and latency/error budgets.
- Decide whether Cloudflare Worker logs join this stack in phase two. Backend
  origin visibility should not wait on that integration.

## Primary references

- [Grafana Alloy Docker log source](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [Grafana Alloy Prometheus scrape](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.scrape/)
- [Grafana Alloy resource estimates](https://grafana.com/docs/alloy/latest/set-up/estimate-resource-usage/)
- [Grafana Alloy memory controls](https://grafana.com/docs/alloy/latest/reference/cli/environment-variables/)
- [Grafana Cloud Prometheus remote write](https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/alloy/reference/components/prometheus/prometheus.remote_write/)
- [Grafana Cloud authentication and access policies](https://grafana.com/docs/grafana-cloud/platform/security-and-account-management/security-and-access/authentication-and-permissions/)
- [Prometheus Go application instrumentation](https://prometheus.io/docs/guides/go-application/)
