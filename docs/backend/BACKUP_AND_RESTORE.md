# Backup and restore operations (snapshot v1, logical export v1, age envelope)

**Status:** Maintained

## Delivered boundary

The `zoomigo-backup` Go command creates, verifies, age-encrypts, and restores a migration-aware SQLite snapshot archive, and produces and imports a versioned logical export. Cryptography and restore behavior are local and require no cloud service. The VM upload script sends only the encrypted envelope to a private Cloudflare R2 bucket.

The command deliberately has no HTTP endpoint. Backup and restore paths are supplied only by an authorized host operator or scheduler, never by a player-facing request.

## SQLite snapshot format

The verified payload is one gzip-compressed tar archive:

```text
zoomigo-backup-2026-08-05T190000Z-v1.tar.gz
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
- `encrypted: false`, because this manifest describes the inner payload. Production output wraps the entire payload in an authenticated age v1 envelope named `.tar.gz.age`; the manifest is not visible until decryption succeeds.

The format version describes the archive, not the database schema. Older SQLite snapshots remain restorable while their newest migration is no newer than the migrations embedded in the restoring binary.

## Create and verify

Plaintext commands remain available for local tests and format tooling:

```text
zoomigo-backup create \
  --database-url file:/data/zoomigo.db \
  --output /backups/zoomigo-backup-2026-08-05T190000Z-v1.tar.gz \
  --app-version <deployed-version>

zoomigo-backup verify \
  --archive /backups/zoomigo-backup-2026-08-05T190000Z-v1.tar.gz
```

Creation uses SQLite `VACUUM INTO` to make a transactionally consistent standalone snapshot of the live WAL database. The source database is unchanged. Deleted SQLite pages are not carried into the snapshot.

Before publishing an archive, the command:

1. creates the snapshot and validates SQLite integrity and foreign keys;
2. records the migration ledger and safe row counts;
3. writes the manifest and SHA-256 checksums;
4. reopens and verifies the completed compressed archive;
5. syncs a temporary archive and renames it to the requested output only after verification succeeds.

An existing archive is never overwritten.

Production creation uses an age X25519 public recipient:

```text
zoomigo-backup create-encrypted \
  --database-url file:/data/zoomigo.db \
  --output /backups/zoomigo-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --recipient age1... \
  --app-version <deployed-version>
```

The command creates and verifies the protected payload, encrypts it, atomically publishes only the `.age` output, and removes its mode-`0600` temporary payload. The public recipient can remain on the VM. The matching `AGE-SECRET-KEY-...` identity must not.

The identity file is whatever `age-keygen` wrote; its `# created:` and `# public key:` comment lines are skipped. Exactly one key must remain, because one archive has one recovery key and a file holding several means the wrong file was supplied. The file must be mode `0600` and owned by uid `65532`, the user the container runs as.

An authorized recovery operator can authenticate and verify the envelope with a temporarily supplied identity file:

```text
zoomigo-backup verify-encrypted \
  --archive /backups/zoomigo-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --identity /restore/zoomigo-backup-identity.txt
```

The wrong identity, a modified envelope, a modified inner archive, or a mismatched checksum fails closed.

## Isolated restore

```text
zoomigo-backup restore-encrypted \
  --archive /backups/zoomigo-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --identity /restore/zoomigo-backup-identity.txt \
  --target /restore/zoomigo-restored.db
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
2. backs up the live database from a second process and encrypts it to a generated test recipient;
3. verifies and restores the envelope with the matching identity;
4. starts a second API against the restored file;
5. compares the owner's private entry and reaction projections;
6. corrupts an encrypted envelope and proves restoration fails without creating a target.

Focused real-SQLite tests additionally prove that an older snapshot receives current forward migrations and that an existing target cannot be overwritten.

## Logical export (format v1)

The SQLite snapshot above is a migration-aware _same-engine_ backup: restoring it requires SQLite and a schema whose migration ledger is a superset of the snapshot's. The logical export is the durable companion format. It carries the data, not the database file, so it survives a schema change that the migration runner cannot express and an eventual engine change.

Both formats are produced by the same daily job and encrypted to the same age recipient. Keep both: the snapshot is the fast recovery path, the export is the durable one.

### Export format

```text
zoomigo-export-20260808T190000Z-v1.tar.gz
├── manifest.json
├── tables/
│   ├── clubs.jsonl
│   ├── teams.jsonl
│   └── ... one file per table, in foreign-key dependency order
└── SHA256SUMS
```

Each `tables/<name>.jsonl` holds one JSON object per row, keys in the manifest's declared field order. Values encode as: text and dates as JSON strings, integers and reals as JSON numbers, `BLOB` as base64, SQL `NULL` as `null`. Rows are ordered by the table's primary key, so two exports of identical data are byte-identical archives.

`manifest.json` records the export format version, the archive kind, the UTC creation timestamp, the application version, source provenance (engine, SQLite version, applied migrations), and for every table its path, field list, ordering, row count, SHA-256 hash, and byte size.

The format version describes the file layout and value encoding only. It is **not** the schema version, and the source provenance is never read during an import — that is what keeps an export independent of the layout of the database that produced it.

### Schema evolution rules

The exported field set is owned by `backend/internal/backup/logical_schema.go`, not by the live SQLite schema. On import:

- a field the export omits, because it did not exist yet, takes the default declared for it in the current build; a field with no declared default is a hard error rather than an invented value;
- a table the export omits, because it did not exist yet, is left empty after forward migration;
- a table or field the export contains that the current build does not know is rejected, because it can only mean the export came from a newer build and importing it would silently drop data.

Adding a nullable column therefore needs only a new `nullable(...)` field. Adding a `NOT NULL` column needs a field with an explicit default. Neither changes the export format version.

### Export, verify, and import

```text
zoomigo-backup export-encrypted \
  --database-url file:/data/zoomigo.db \
  --output /backups/zoomigo-export-20260808T190000Z-v1.tar.gz.age \
  --recipient age1... \
  --app-version <deployed-version>

zoomigo-backup verify-export-encrypted \
  --archive /backups/zoomigo-export-20260808T190000Z-v1.tar.gz.age \
  --identity /restore/zoomigo-backup-identity.txt

zoomigo-backup import-encrypted \
  --archive /backups/zoomigo-export-20260808T190000Z-v1.tar.gz.age \
  --identity /restore/zoomigo-backup-identity.txt \
  --target /restore/zoomigo-imported.db
```

`export`, `verify-export`, and `import` are the plaintext equivalents, for local tests and format tooling.

The export runs inside one deferred read transaction, so every exported table
comes from a single consistent point in time while the API keeps serving. The
source database is not modified. Publication mirrors the snapshot path: write
to a temporary archive, re-extract and verify it, then rename.

Verification is offline and needs no database. It checks the envelope shape, `SHA256SUMS`, the manifest against its checksum, each table file against its manifest digest and byte size, the declared dependency ordering, the declared row count, and that every row carries exactly the fields the manifest declares.

Import never touches the live database. It creates a fresh database beside the target, migrates it to the current schema, loads every table in dependency order inside one transaction, reruns SQLite integrity and foreign-key checks, then checkpoints and atomically renames it into place. The target must not already exist. Rows a migration seeds — currently `activity_definitions` — are cleared before loading so the export stays authoritative rather than merging with the current seed.

### What the export contains

The export carries every table, including `auth_credentials` and `auth_sessions`. Those hold credential and session **hashes**, never plaintext QR secrets, PINs, or session tokens, but they are still private data. Treat a logical export exactly like a SQLite snapshot: it leaves the host only inside the age envelope.

### Proven by

- A focused real-SQLite round trip seeds every current table, including nullable
  columns, `BLOB` columns and columns added by later migrations, exports,
  imports, and compares every exported table row for row.
- A second test exports from an older schema and imports it into the current
  schema, asserting later-added columns take their declared defaults and
  later-added tables arrive empty.
- Further tests cover byte-identical repeat exports, rejection of a tampered table without creating a target, rejection of an export from a newer build, refusal to overwrite an existing database, the age envelope, and that the two archive formats reject each other.
- The Docker E2E suite exports from the live API's WAL database, imports it, starts a second API on the result, and compares the owner's private projections.

## Production operation and remaining approval

The scheduled VM job creates one encrypted SQLite snapshot and one encrypted logical export each day and uploads only those `.age` files to private S3-compatible storage through `rclone`. Cloudflare R2 is the first provider and the initial bucket is `zoomigo-backups`, but the runtime contract uses generic `BACKUP_S3_*` settings. After both uploads succeed it prunes local encrypted archives of either kind older than `LOCAL_BACKUP_RETENTION_DAYS` (seven by default); a failed upload never triggers pruning. Cloud credentials are external to Compose in root-readable `/etc/zoomigo/backup-s3.env`; default test commands never contact object storage. Cloudflare's current Standard free tier includes 10 GB-month, one million Class A operations, and ten million Class B operations per month, but usage and billing still need monitoring.

Before production persistence, approve and record:

- who holds the age identity and its recovery copy, plus rotation procedure;
- daily/weekly retention and how deletion requests age out of backups;
- RPO/RTO and operator access/auditing;
- one timed test-only execution of `LIVE_RESTORE_RUNBOOK.md`;
- quarterly isolated drills and a drill before destructive migrations.

See `PRODUCTION_APPROVAL_CHECKLIST.md` for recommended initial values and the exact owner decisions still required.
