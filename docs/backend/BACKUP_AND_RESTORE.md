# Backup and restore plan (draft 0.1)

## Goal

Keep the first production backup system small, local-file based, testable without cloud services, and safe across forward database migrations. A backup is not complete until an automated restore proves that the resulting API data matches the source.

## Archive format

Each backup is one compressed archive with a stable format version:

```text
stridecrew-backup-2026-08-05T190000Z-v1.tar.zst
├── manifest.json
├── database.sqlite3
└── SHA256SUMS
```

`manifest.json` records:

- backup-format version;
- creation timestamp and application version;
- database engine and SQLite library version;
- applied `schema_migrations` versions;
- SHA-256 hash and byte size of `database.sqlite3`;
- non-sensitive validation counts for clubs, teams, players, entries, and reactions;
- whether the archive is encrypted and which key identifier was used, never the key itself.

The format version describes the archive, not the live database schema. Older database snapshots remain restorable because the service retains every forward migration and runs them after restoring into an isolated file.

## Creating a backup

The planned `cmd/backup create` command will:

1. acquire the same application-level maintenance lock used by migrations;
2. create a transactionally consistent standalone SQLite snapshot using a server-generated destination path;
3. query the migration ledger and safe validation counts;
4. write the versioned manifest and checksums;
5. verify the archive by opening the snapshot read-only and running SQLite integrity and foreign-key checks;
6. encrypt the completed archive before it leaves the host;
7. write through a temporary filename and rename only after verification succeeds.

The command must never copy the live SQLite file directly while it may have active WAL state. Backup paths are service-owned; no player- or request-supplied path is accepted.

## Restoring

The planned `cmd/backup restore` command will be offline and explicit. It will:

1. unpack into a newly created temporary directory;
2. validate the archive-format version, file list, hashes, and encryption metadata;
3. reject a snapshot created by a newer, unsupported migration version;
4. open the restored database in isolation and run integrity and foreign-key checks;
5. apply all missing forward migrations with the normal migration runner;
6. run application invariants and compare the manifest's safe validation counts;
7. stop API writes, retain the current database as a rollback file, and atomically swap in the verified restore;
8. start the API and require readiness plus a private smoke test before removing the rollback file.

Restores never run migrations against the only copy of an archive. A restore drill must be possible on a developer machine and in Docker without credentials or cloud access.

## Retention and storage

Initial proposal, pending production hosting and privacy review:

- encrypted daily backups retained for 14 days;
- encrypted weekly backups retained for 8 weeks;
- at least one copy stored outside the API host's persistent volume;
- quarterly restore drills, and a restore drill before any destructive migration;
- access limited to club operators with audited restore/download actions.

Exact recovery-point and recovery-time objectives, encryption provider, key rotation, and deletion/retention requirements remain open production decisions.

## Schema and adapter changes

- Published migrations remain immutable and bundled with the service.
- Archive format changes require a new format version and backward-reading support.
- Before replacing SQLite with Postgres, add a stable logical export inside the archive (versioned JSON Lines by domain record) and an E2E migration/restore test. Do not treat a raw SQLite file as the long-term cross-engine interchange format.
- Backup validation must use public repository behavior and database integrity checks, not private struct serialization.

## TDD delivery sequence

1. Docker E2E: create fixture data through HTTP, create a backup, and record expected private/safe projections.
2. Docker E2E: restore into a clean API/database container, allow migrations to advance, and verify the same projections through HTTP.
3. Docker E2E: corrupt a snapshot/hash and prove restore fails without touching the live database.
4. Docker E2E: restore a checked-in fixture from the previous schema version and prove forward migration succeeds.
5. Implement `cmd/backup`, archive validation, maintenance locking, and operational documentation until those tests pass.
