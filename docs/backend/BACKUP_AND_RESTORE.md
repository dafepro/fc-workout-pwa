# Backup and restore operations (format v1)

## Delivered boundary

The `stridecrew-backup` Go command creates, verifies, and restores a migration-aware flat-file archive without cloud services or credentials. It is intended for the initial single-replica SQLite deployment.

The command deliberately has no HTTP endpoint. Backup and restore paths are supplied only by an authorized host operator or scheduler, never by a player-facing request.

## Archive format

Each backup is one gzip-compressed tar archive:

```text
stridecrew-backup-2026-08-05T190000Z-v1.tar.gz
├── manifest.json
├── database.sqlite3
└── SHA256SUMS
```

`manifest.json` records:

- archive format version;
- UTC creation timestamp and application version;
- database engine and SQLite library version;
- applied `schema_migrations` versions;
- SHA-256 hash and byte size of `database.sqlite3`;
- non-sensitive validation counts for clubs, teams, players, entries, and reactions;
- `encrypted: false` for the current local format.

The format version describes the archive, not the database schema. Older SQLite snapshots remain restorable while their newest migration is no newer than the migrations embedded in the restoring binary.

## Create and verify

```text
stridecrew-backup create \
  --database-url file:/data/stridecrew.db \
  --output /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz \
  --app-version <deployed-version>

stridecrew-backup verify \
  --archive /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz
```

Creation uses SQLite `VACUUM INTO` to make a transactionally consistent standalone snapshot of the live WAL database. The source database is unchanged. Deleted SQLite pages are not carried into the snapshot.

Before publishing an archive, the command:

1. creates the snapshot and validates SQLite integrity and foreign keys;
2. records the migration ledger and safe row counts;
3. writes the manifest and SHA-256 checksums;
4. reopens and verifies the completed compressed archive;
5. syncs a temporary archive and renames it to the requested output only after verification succeeds.

An existing archive is never overwritten.

## Isolated restore

```text
stridecrew-backup restore \
  --archive /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz \
  --target /restore/stridecrew-restored.db
```

Restore is intentionally non-destructive:

1. reject an unsupported format, unexpected archive entry, duplicate, oversized file, checksum mismatch, corrupt database, foreign-key violation, or newer unsupported migration;
2. copy the verified snapshot to a temporary database beside the requested target;
3. apply all missing forward migrations with the service's normal migration runner;
4. rerun integrity, foreign-key, and safe-count validation;
5. checkpoint WAL state, sync the database, and atomically rename it to the new target.

The target must not already exist. This command never swaps or overwrites the live database. A production cutover requires the API to be stopped, the current database retained as a rollback file, the restored database moved into place, and readiness plus private smoke checks completed before rollback removal.

## Automated drill

The Docker E2E suite:

1. creates private entries and reactions through the running API;
2. backs up the live database from a second process;
3. verifies and restores the archive;
4. starts a second API against the restored file;
5. compares the owner's private entry and reaction projections;
6. corrupts an archive and proves restoration fails without creating a target.

Focused real-SQLite tests additionally prove that an older snapshot receives current forward migrations and that an existing target cannot be overwritten.

## Production work still required

The current archive is suitable for local drills and same-host staging, but it must not be copied off-host with youth data until encryption and access controls are implemented.

Before production persistence:

- select an encryption envelope and managed key provider;
- set recovery-point and recovery-time objectives;
- choose daily/weekly retention after privacy and deletion-policy review;
- schedule encrypted off-host copies and audited operator access;
- define an offline live-cutover runbook and rollback retention;
- run quarterly restore drills and a drill before destructive migrations.

Before replacing SQLite with Postgres, add a stable versioned logical export such as JSON Lines. The raw SQLite snapshot is a migration-aware same-engine backup, not a permanent cross-engine interchange format.
