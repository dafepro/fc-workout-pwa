# Backend observability

**Status:** Maintained

ZoomiGo implements privacy-safe structured logs, bounded Prometheus metrics, and
an optional co-located Grafana Alloy collector. This is the operating contract,
not a proposal.

## Runtime shape

- The API emits JSON request logs with bounded route templates, method, status,
  duration, request ID, environment, service, and release.
- A separate metrics listener exports application metrics; Caddy does not expose
  it publicly.
- Prometheus series cover HTTP traffic/latency/in-flight requests, bounded error
  codes, SQLite operation outcomes/latency, authentication outcomes, Canvas
  connections, and Canvas message outcomes.
- Root-owned textfile metrics cover host resources, backup and restore-drill
  freshness, and aggregate Lounge holds with collection status and freshness.
- Alloy tails bounded container logs and scrapes application/host metrics, then
  writes to independently scoped remote log and metric endpoints.

The production VM class is 1 GiB with 1 GiB swap. Observability refuses to start
below 900,000 KiB total RAM, below 256 MiB available memory, or below 2 GiB free
in its data directory. The feature is controlled by `ENABLE_OBSERVABILITY`; a
disabled collector must not prevent the API from running.

## Privacy and cardinality

Never log or label:

- player/staff names, email addresses, IDs, team IDs, credential/PIN/session
  material, raw URL paths, query strings, request or response bodies;
- training results, effort, exhaustion, assessments, avatar configuration, or
  analytics subject keys;
- arbitrary database errors or unbounded Canvas room/entity IDs.

Dynamic paths collapse to bounded route templates. Error codes, auth surfaces,
SQLite operations, Canvas message kinds, and outcomes use fixed allowlists with
an `other` fallback. Logs and metrics are operational data, not product
analytics.

## Configuration

Production settings are documented in
[../deploy/secrets/README.md](../deploy/secrets/README.md). Log and metric write
tokens must be distinct and limited to the destination they serve. The local
collector data directory is root-owned and is not a durable log archive.

The deployment sequence is:

1. configure endpoints and scoped credentials;
2. keep `ENABLE_OBSERVABILITY=false` while validating the environment;
3. run the admission preflight and establish a resource baseline;
4. enable, release, and verify Alloy health, zero restarts, remote ingestion,
   bounded cardinality, and host headroom;
5. disable and release again if the resource or privacy checks fail.

## Alerts and review

At minimum review public readiness, 5xx/error rate, latency, authentication
throttling, SQLite errors, Canvas disconnects, disk/memory pressure, backup
freshness, restore-drill freshness, collector restarts, and remote-write
failure. Alert destinations are operator-private configuration.

Operational review must use aggregate queries. Do not add user drill-down to
logs or metrics. The operator analytics page is the separate bounded surface for
approved product behavior.

## Manual diagnostics

Dispatch `operations.yml` (**Read-only operations**) from `main`. Mode `query`
uses only the Grafana read credential, reviewed presets and a one-day sanitized
artifact. Mode `host-diagnostic` uses only the production SSH credential and
runs the fixed collector diagnostic script against the pinned host. Query
parameters are unused in host mode; neither mode accepts an arbitrary command
or query expression.

## Lounge hold monitoring activation

The existing one-minute host metrics timer also calls the read-only
`lounge-placement-holds --stale-after 24h` report. Host setup requires Python 3;
the collector uses its standard library and adds no timer or package service.
Eight fixed aggregate gauges contain counts only. Invalid or failed collection
keeps the prior counts and last-success timestamp and sets
`zoomigo_lounge_holds_collection_success` to zero. Collection is bounded to
30 seconds and writes private textfiles atomically.

Before retiring the scheduled Actions monitor, deploy the collector through a
separately authorized production rollout, observe fresh production ingestion,
and prove alert delivery for all of:

- `zoomigo_lounge_stale_canvas_outcomes > 0` or
  `zoomigo_lounge_stale_item_outcomes > 0`;
- `zoomigo_lounge_holds_collection_success == 0`;
- `time() - zoomigo_lounge_holds_last_success_timestamp_seconds > 300` or an
  absent freshness series for the expected environment.

Configure these rules and a private contact point in the telemetry service;
merging the collector does not configure or activate alerts. Keep the current
six-hour GitHub schedule until that replacement is observed. Afterwards remove
only its schedule and retain manual reporting. Never finalize or release holds
based on age alone.

## Verification

- Go tests enforce route templating, label allowlists, and absence of sensitive
  values.
- `deploy/observability/config_test.mjs` validates Alloy and deployment
  configuration.
- `scripts/observability-query.test.mjs` validates the supported query path.
- VM production checks validate collector health and resource admission when
  the feature is enabled.
