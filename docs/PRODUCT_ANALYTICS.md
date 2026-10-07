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
retained as route names. Accepted planned activity/rest and daily prize/open
outcomes contain no identifiers or athletic values. HTTP 201 counts a new write;
HTTP 200 replay does not create another training/rest event. Prize events
distinguish `created` and `existing`. Plan activity retains only the predefined
completion category; it is not proof that every block or plan day completed.
Bounded client recovery events record retry, confirmation and unresolved reply.

## Product scorecard

Use invented data first. These are observation definitions, not accepted targets
or proof of representative-player comprehension. Dev collection remains off;
the contract and fixtures can be evaluated without enabling D1 writes.

| Measure                     | Evidence and interpretation                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted training           | New training events, counted once for HTTP 201. Authoritative entries remain in Go/SQLite. Replayed operations measure recovery, not another session.                                                                                                                              |
| Planned participation       | New planned activity/rest events, with partial activity separate. Actual day completion remains the API's projection.                                                                                                                                                              |
| Save recovery               | Observed `confirmed` versus `retry` events, plus unresolved replies. No denominator means unavailable. Best-effort events can be lost and are not a receipt.                                                                                                                       |
| Prize usefulness            | New claim/open outcomes versus existing-result replays, plus bounded Prizes route visits. Never infer ownership from telemetry.                                                                                                                                                    |
| Return participation        | Pseudonymous return visits and acceptance-event days within the approved retention window. Actual participation dates come from authoritative API projections; delayed/backdated events cannot reconstruct them. Report cohort limitations; time in World is not training success. |
| Comprehension and usability | D13 invented-data walkthrough: task completion, help required and explanation of personal days, Team sessions, plan completion, reward rules and portrait/outfit applicability. Automated clicks cannot supply this evidence.                                                      |

Targets and representative walkthrough results remain open. Separate privacy and
retention approvals must precede real collection.

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
