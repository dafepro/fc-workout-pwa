# Product analytics

**Status:** Maintained

ZoomiGo has an opt-in first-party product-analytics path. It uses a typed event
catalog, a same-origin endpoint, server-derived pseudonymous identity, a
dedicated Cloudflare D1 database, and an operator-only aggregate overview. It
does not use a third-party analytics SDK, cookies, session replay, broad
autocapture, advertising IDs, or raw training values.

## Enablement boundary

Release requires explicit trusted `PRODUCT_ANALYTICS_APPROVED=true`; the default
is `false`. A provisioned database alone never authorizes collection. Dev releases
force collection off even if approval is supplied. An approved production release
fails before deployment when its binding, database ID or subject secret is absent.
The generated effective `PRODUCT_ANALYTICS_ENABLED` flag is printed in release
evidence. Runtime collection also requires all of these:

- `PRODUCT_ANALYTICS_ENABLED=true` in the Worker configuration;
- an `ANALYTICS_DB` D1 binding;
- a valid `ANALYTICS_SUBJECT_KEY` secret.

Absent or invalid configuration fails closed for collection and leaves normal
product workflows usable. Infrastructure provisions the dedicated D1 resource;
approved release automation discovers its ID rather than copying it into GitHub.

Real-player collection remains an owner decision in
[OPEN_DECISIONS.md](OPEN_DECISIONS.md).

## Event contract

[../lib/analytics/catalog.ts](../lib/analytics/catalog.ts) is the executable
allowlist. Client events cover visit, bounded route summary, connectivity,
install, training-entry intent/activity selection, avatar,
reaction picker, session history, cheer inbox, and challenge action.

Server-side proxy instrumentation records approved authentication, training
entry, reaction, avatar, and operation-outcome events. Unknown names,
properties, enumerations, oversized batches, duplicate IDs, and timestamps
outside the accepted window are rejected.

The browser supplies a random per-tab visit ID and event intent. The server
derives HMAC subject/team keys from the authenticated session. Names, raw IDs,
email, credential/session material, URLs, free text, athletic measurements,
effort, exhaustion, and response bodies are forbidden.

Each tab's validated active team scopes its analytics. A queued client batch
retains the context in which it was created when the next visit switches teams.
An invalid or revoked explicit context cannot be attributed to another team.
Page exit and hidden-page summaries are queued before their flush.

The bounded route catalog includes Today, Log, Team, Plan, Progress, Prizes, Me,
session detail, portrait editing, login and Team World. Unknown paths, query
strings, fragments and staff paths remain `unknown`; identifiers are never
retained as route names. Plan/rest/prize action outcomes and a validated product
success scorecard remain D21 work.

## Storage and retention

The current D1 schema has one `analytics_events` table plus bounded indexes. It
stores event/source, received and occurred times, pseudonymous keys, visit,
canonical route, active duration, team-local day/hour, allowlisted JSON
properties, and sample weight.

While enabled, a scheduled Worker call prunes raw rows older than 90 days in
bounded batches. Disabling release collection removes its binding and schedule;
existing D1 rows do not automatically disappear or continue scheduled pruning.
D25 must provide independently operated retention/erasure before real collection.
The current implementation does **not** have durable daily-aggregate,
maintenance, or erasure-tombstone tables. Do not describe those planned tables
as shipped. Restore-safe subject erasure and long-lived non-personal rollups are
roadmap work after policy approval.

## Operator overview

`/staff/admin/analytics` requires a platform-operator session. It shows bounded
counts for active players, active minutes, training entries, reactions, recent
row/write estimates, top routes, and local-hour distribution. Breakdowns remain
hidden below five active subjects in 30 days and the result is cached briefly to
limit D1 reads.

Coaches and club administrators do not receive behavioral analytics. D1 is not
a player lookup or training-data store.

## Operations and tests

- Default tests use local in-memory D1-compatible fakes and no cloud account.
- Release configuration tests cover enabled, disabled, and missing-resource
  cases.
- Catalog, route, identity, proxy, storage, and operator-guard tests protect the
  event boundary.
- Capacity is displayed conservatively because indexes and retention deletes
  also consume D1 writes.

Before production enablement, approve retention/erasure, verify event volume and
small-cohort behavior, and inspect D1 storage/write metrics. Analytics failure
must never block sign-in, navigation, training, reactions, avatar save, or
sign-out.
