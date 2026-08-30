# Product analytics

**Status:** Maintained

ZoomiGo has an opt-in first-party product-analytics path. It uses a typed event
catalog, a same-origin endpoint, server-derived pseudonymous identity, a
dedicated Cloudflare D1 database, and an operator-only aggregate overview. It
does not use a third-party analytics SDK, cookies, session replay, broad
autocapture, advertising IDs, or raw training values.

## Enablement boundary

Collection is active only when all of these exist:

- `PRODUCT_ANALYTICS_ENABLED=true` in the Worker configuration;
- an `ANALYTICS_DB` D1 binding;
- a valid `ANALYTICS_SUBJECT_KEY` secret.

Absent or invalid configuration fails closed for collection and leaves normal
product workflows usable. Infrastructure provisions the dedicated D1 resource;
release automation discovers its ID rather than copying it into GitHub.

Real-player collection remains an owner decision in
[OPEN_DECISIONS.md](OPEN_DECISIONS.md).

## Event contract

[../lib/analytics/catalog.ts](../lib/analytics/catalog.ts) is the executable
allowlist. Client events cover visit, bounded route summary, connectivity,
install, training-entry intent/activity selection, leaderboard filter, avatar,
reaction picker, session history, cheer inbox, and challenge action.

Server-side proxy instrumentation records approved authentication, training
entry, reaction, avatar, and operation-outcome events. Unknown names,
properties, enumerations, oversized batches, duplicate IDs, and timestamps
outside the accepted window are rejected.

The browser supplies a random per-tab visit ID and event intent. The server
derives HMAC subject/team keys from the authenticated session. Names, raw IDs,
email, credential/session material, URLs, free text, athletic measurements,
effort, exhaustion, and response bodies are forbidden.

The canonical route catalog still reflects the older Home/Log/Team/Me surface;
Plan, Progress, and Prizes currently fall into `unknown`. Expanding that bounded
enum to match the consolidated shell is known roadmap work, not evidence that
the new screens are unimplemented.

## Storage and retention

The current D1 schema has one `analytics_events` table plus bounded indexes. It
stores event/source, received and occurred times, pseudonymous keys, visit,
canonical route, active duration, team-local day/hour, allowlisted JSON
properties, and sample weight.

A scheduled Worker call prunes raw rows older than 90 days in bounded batches.
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
