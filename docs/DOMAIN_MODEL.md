# Domain model

**Status:** Maintained

This is the conceptual model and authority map. It intentionally avoids a fixed
table or migration count; [../backend/migrations](../backend/migrations) is the
executable SQLite schema.

## Identity and organization

- **Club** owns teams and club-scoped staff authority.
- **Team** owns an IANA time zone, weekly goal, active memberships, assignments,
  plans, rewards, and one current-generation Lounge room.
- **Player** has a safe display identity, avatar configuration, and one or more
  dated team memberships.
- **Account** authenticates as player, coach, club administrator, or platform
  administrator. A player account refers to one player.
- **Coach team assignment** grants current, explicit authority over one team. A
  shared club is not enough.

Player authentication uses reissuable hashed QR/PIN credentials and hashed
opaque sessions. Staff authentication uses password credentials, encrypted TOTP
enrollment, recovery codes, setup tokens, bounded sign-in challenges, and staff
sessions. Raw secrets are revealed only in their one-time handoff flow.

## Training

- **Activity definition** is a server-owned catalog entry with input kind, unit,
  accepted range, recovery category, and safe point policy.
- **Assignment catalog item** is a predefined coach-selectable workout.
- **Assignment** snapshots one catalog item, target, and active window for a
  team.
- **Training plan** is an immutable published seven-day snapshot built from a
  predefined template. Days contain ordered activity blocks or planned rest.
- **Training entry** is an append-only player result linked to a team and,
  optionally, exact assignment or plan provenance. Deletion is a tombstone;
  editing is delete-and-re-enter.
- **Planned-rest check-in** proves participation in an exact rest day without
  creating a workout or accepting athletic values.

Team-local dates determine membership, backdating, plan-day, Momentum, and
weekly boundaries. Explicit partial work does not complete an assignment or
plan block even if its numeric value reaches a target.

## Progress and social projections

Momentum, streaks, consistency, weekly completion, and challenge groups are
derived projections. The server calculates them from accepted, non-deleted
records and exposes only the fields approved for each audience.

A **reaction** binds an authenticated sender to another active teammate, one
predefined reaction, and a bounded context. The private badge message is
server-generated. Rate limits and idempotency are authoritative across devices.

## Rewards and inventory

- **Prize box** is earned from a predefined source and remains sealed until its
  owner opens it.
- **Player unlock** is one owned item from the versioned avatar or Lounge
  catalogs, including source, rarity, unlock time, and optional viewed time.
  Avatar unlocks can target head, kit, hat, eyewear, or effect slots; their
  predefined asset identifiers are shared by the reward catalog and Studio.
- **Team reward** is a coach-selected predefined reward and its lifecycle
  events. It carries no athletic value.

Opening a prize box and granting a nonduplicate item are one transaction.
Completing three or seven distinct proven plan days grants separate boxes once;
later deletion or plan cancellation does not revoke an already granted box.

## Team Lounge

A Lounge room belongs to a team and immutable Canvas generation. Durable room
state includes trusted snapshots, visits, placement credits/reservations,
single-use socket tickets, fenced room ownership, emote cooldowns, and
owner/entity/revision-bound mutation permits.

Canvas outcomes, not the browser, finalize consumed placement or edit holds.
Unknown and expired outcomes stay held for operator reconciliation. A generation
cutover starts a clean room and does not import retired state or debit the new
generation's budget.

Lounge state is play state only. It cannot create training credit, Momentum, or
a public performance result.

## Analytics and operations

First-party product analytics lives in a separate Cloudflare D1 database. It
stores typed events with server-derived pseudonymous subject and team keys; it
is not an identity or training-data source of truth. Operational logs and
Prometheus metrics are separate again and prohibit user-level labels.

Admin and authentication audit events record bounded action metadata without
credentials, training values, or arbitrary request bodies.

## Persistence boundary

The initial deployment is one Go API writer over a local SQLite file. Repository
interfaces keep business rules outside SQLite-specific SQL. A move to managed
Postgres is trigger-based future work, not a partially supported second path.

The connected player runtime is composed only from the authenticated session
and connected HTTP gateways. Device-local prototype fixtures and persistence
live behind a separately loaded unhosted-prototype adapter; connected failures
cannot select or inherit that adapter.

Backup snapshots and logical exports contain private hashed credentials and
sessions as well as product data. They receive the same protection as the live
database and leave the host only inside an age-encrypted envelope.
