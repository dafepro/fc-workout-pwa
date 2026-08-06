# Backup and restore operations (format v1 + age envelope)

## Delivered boundary

The `stridecrew-backup` Go command creates, verifies, age-encrypts, and restores a migration-aware flat-file archive. Cryptography and restore behavior are local and require no cloud service. The VM upload script sends only the encrypted envelope to a private Cloudflare R2 bucket.

The command deliberately has no HTTP endpoint. Backup and restore paths are supplied only by an authorized host operator or scheduler, never by a player-facing request.

## Archive format

The verified payload is one gzip-compressed tar archive:

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
- `encrypted: false`, because this manifest describes the inner payload. Production output wraps the entire payload in an authenticated age v1 envelope named `.tar.gz.age`; the manifest is not visible until decryption succeeds.

The format version describes the archive, not the database schema. Older SQLite snapshots remain restorable while their newest migration is no newer than the migrations embedded in the restoring binary.

## Create and verify

Plaintext commands remain available for local tests and format tooling:

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

Production creation uses an age X25519 public recipient:

```text
stridecrew-backup create-encrypted \
  --database-url file:/data/stridecrew.db \
  --output /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --recipient age1... \
  --app-version <deployed-version>
```

The command creates and verifies the protected payload, encrypts it, atomically publishes only the `.age` output, and removes its mode-`0600` temporary payload. The public recipient can remain on the VM. The matching `AGE-SECRET-KEY-...` identity must not.

An authorized recovery operator can authenticate and verify the envelope with a temporarily supplied identity file:

```text
stridecrew-backup verify-encrypted \
  --archive /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --identity /restore/stridecrew-backup-identity.txt
```

The wrong identity, a modified envelope, a modified inner archive, or a mismatched checksum fails closed.

## Isolated restore

```text
stridecrew-backup restore-encrypted \
  --archive /backups/stridecrew-backup-2026-08-05T190000Z-v1.tar.gz.age \
  --identity /restore/stridecrew-backup-identity.txt \
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
2. backs up the live database from a second process and encrypts it to a generated test recipient;
3. verifies and restores the envelope with the matching identity;
4. starts a second API against the restored file;
5. compares the owner's private entry and reaction projections;
6. corrupts an encrypted envelope and proves restoration fails without creating a target.

Focused real-SQLite tests additionally prove that an older snapshot receives current forward migrations and that an existing target cannot be overwritten.

## Production operation and remaining approval

The scheduled VM job creates one encrypted archive each day and uploads only that `.age` file to a private R2 Standard bucket through `rclone`. After a successful upload it prunes local encrypted archives older than `LOCAL_BACKUP_RETENTION_DAYS` (seven by default); a failed upload never triggers pruning. Cloud credentials are external to Compose in root-readable `/etc/stridecrew/r2.env`; default test commands never contact R2. Cloudflare's current Standard free tier includes 10 GB-month, one million Class A operations, and ten million Class B operations per month, but usage and billing still need monitoring.

Before production persistence, approve and record:

- who holds the age identity and its recovery copy, plus rotation procedure;
- daily/weekly retention and how deletion requests age out of backups;
- RPO/RTO and operator access/auditing;
- one timed test-only execution of `LIVE_RESTORE_RUNBOOK.md`;
- quarterly isolated drills and a drill before destructive migrations.

See `PRODUCTION_APPROVAL_CHECKLIST.md` for recommended initial values and the exact owner decisions still required.

Before replacing SQLite with Postgres, add a stable versioned logical export such as JSON Lines. The raw SQLite snapshot is a migration-aware same-engine backup, not a permanent cross-engine interchange format.
