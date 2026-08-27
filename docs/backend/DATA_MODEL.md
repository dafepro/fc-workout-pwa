# Backend data model and persistence plan (draft 0.1)

## Storage choice

Use Go's `database/sql` with the CGo-free `modernc.org/sqlite` adapter. The first cloud deployment is one API replica in one region with the SQLite file on a mounted persistent volume. Keep SQL behind repository interfaces, use portable column types and explicit migrations, and avoid SQLite-only business logic where a managed Postgres deployment may later be preferable.

This is intentionally a single-writer deployment. Multiple API replicas must not open the same database file over a shared network filesystem. A managed Postgres adapter becomes the preferred next step if the service needs horizontal replicas, multi-region writes, managed high availability/PITR, or substantially more concurrent writes. Before storing production youth data, choose a host with persistent-volume snapshots, define backup retention, and prove a restore into a clean service.

The database is authoritative for identities, memberships, entries, reactions, idempotency, and audit timestamps. Derived streaks, progress, and safe leaderboard projections should be computed from authoritative records or maintained as rebuildable projections.

## Core relationships

```text
Club
├── Team
│   ├── TeamMembership ── Player
│   ├── CoachAssignment ── Account (coach)
│   ├── TrainingEntry ── Player
│   └── Reaction ── sender Player / recipient Player
└── Account (player, coach, or club_admin)
```

## Foundation tables

- `clubs`: organization boundary
- `teams`: club ownership, season, weekly goal, and IANA time zone
- `players`: locked display identity and avatar configuration. `avatar_configuration_json` is written by `PUT /v1/me/avatar` and read by the session projection; it always holds a JSON object, `{}` when nothing has been saved. The server stores the bytes it re-serialized itself, never the client's, and validates shape rather than catalog membership because the option catalog lives in the client
- `accounts`: authenticated principal and role; player accounts reference one player
- `team_memberships`: active player/team relationship with date bounds
- `coach_team_assignments`: active coach/team authorization with date bounds
- `activity_definitions`: server-owned input kind, unit, allowed ranges, and safe point policy
- `training_entries`: private structured result, effort/exhaustion, trusted timestamps, and soft deletion
- `prize_boxes`: sealed daily and 3/7-day plan awards with hashed idempotency keys and transactional open results
- `player_unlocks`: private predefined Avatar and Team Lounge inventory; no labels, files, or player-authored metadata
- `reactions`: predefined type, recipient, safe context snapshot, team-local day, read state, and idempotency key

## Reaction rolling limit

The server retains `team_day` as a useful team-local projection, but the cheer limit uses `created_at` and a rolling 30-minute window. Within one transaction it:

1. confirms sender/recipient membership and context authorization;
2. checks for an existing `(sender, idempotency_key)` result;
3. counts active reactions for `(sender, recipient)` newer than 30 minutes;
4. rejects count 5 or greater;
5. inserts the reaction with the computed `team_day`.

The supporting indexes are not themselves sufficient to enforce a maximum count. SQLite writes use a transaction mode that prevents concurrent writers from both observing count 4. Postgres will use an advisory or row lock around the sender-recipient pair.

The private Me inbox is a projection over stored reactions rather than a
retention rule. It selects the recipient's non-deleted reactions from the
rolling last seven days and pages them newest-first with a `(created_at, id)`
keyset, 20 by default. Reactions outside that window remain stored until the
separate youth-data retention policy is decided.

## Context vocabulary

Allowed reaction types:

- `clap`
- `fire`
- `strong`
- `hustle`
- `runner`
- `wind`
- `robot_leg`
- `do_it`

Allowed context types:

- `team_progress`
- `leaderboard`

Allowed leaderboard periods:

- `weekly`
- `thirty_days`
- `season`

Allowed leaderboard metrics:

- `effort`
- `streaks`
- `consistency`

No raw result, assessment, exhaustion, exact negative group, or player-authored value is stored in reaction context.

## Migration strategy

- migrations are immutable and applied in lexical order;
- each migration has explicit up/down SQL during early development;
- CI creates an empty SQLite database, applies all up migrations, verifies foreign keys and indexes, then applies down migrations where safe;
- production backups are required before destructive migrations;
- identifiers and timestamps remain application-generated opaque strings and RFC 3339/ISO values until a database-specific UUID/timestamp decision is made.
- player entry creation stores a per-player idempotency key behind a partial unique index so browser retries cannot duplicate sessions;

The migration-aware flat-file backup and isolated restore design is specified in `BACKUP_AND_RESTORE.md`. Backup archives pair a consistent SQLite snapshot with a versioned manifest, hashes, and migration ledger; restores verify and migrate a temporary copy before any live-file swap.

## Decisions before production persistence

- backup frequency, recovery-point objective, and recovery-time objective
- encryption/key-management requirements beyond provider disk encryption
- data retention for deleted entries, reactions, audit events, and expired sessions
- whether a player may belong to multiple clubs or have multiple active player accounts
