# Offline live restore and rollback runbook

This procedure replaces the live SQLite database only during an approved recovery window. It is intentionally separate from the routine restore drill. Rehearse it with test-only data and record the elapsed time before real youth data is allowed.

## Preconditions

- Two adults know the recovery is occurring: the operator and the recovery-key custodian.
- The selected `.tar.gz.age` archive — a `zoomigo-backup-` snapshot or a `zoomigo-export-` logical export — is present in `BACKUP_DIR`, its source and timestamp are recorded, and the matching age identity is available temporarily in `RESTORE_DIR`.
- The checked-out application revision supports every migration in the archive. A logical export has no such constraint.
- A fresh encrypted backup of the current live database has completed and uploaded to the configured S3-compatible store.
- The maintenance window permits the API and PWA to be unavailable.
- All paths below are copied from the protected VM `.env`; never substitute a broad directory or a glob.

## 1. Restore and verify in isolation

From `/opt/app/deploy/vm`:

```sh
sudo ./scripts/restore-drill.sh .env \
  zoomigo-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz.age \
  zoomigo-backup-identity.txt
```

Record the exact restored database filename printed by the command. It must be beneath `RESTORE_DIR`. Do not continue if envelope authentication, checksums, integrity, foreign keys, migration compatibility, or safe counts fail.

If the SQLite snapshot cannot be restored — its migration ledger is too old for the checked-out build, or the database file itself is damaged — use that day's logical export instead. The script takes the same three arguments and switches to verify/import automatically:

```sh
sudo ./scripts/restore-drill.sh .env \
  zoomigo-export-YYYYMMDDTHHMMSSZ-v1.tar.gz.age \
  zoomigo-backup-identity.txt
```

The import builds a database at the current schema from the exported rows, so it is the correct choice precisely when forward migration of an old snapshot is impossible. The rest of this runbook is unchanged; it operates on whichever restored database file the command printed.

## 2. Enter the offline window

Resolve and record the exact paths:

```sh
DATA_DIR=/var/lib/zoomigo/data
RESTORE_DIR=/var/lib/zoomigo/restore
RESTORED_DB="$RESTORE_DIR/restore-drill-YYYYMMDDTHHMMSSZ.db"
ROLLBACK_DB="$DATA_DIR/zoomigo.pre-restore-YYYYMMDDTHHMMSSZ.db"
```

Confirm each value is an absolute, specific file beneath the intended protected
ZoomiGo data directory. Then stop public traffic and the writer:

```sh
docker compose --env-file .env -f compose.yaml stop caddy api
docker compose --env-file .env -f compose.yaml ps
```

Do not continue if `api` is still running.

## 3. Retain the old live database and install the restored copy

Move the exact live database and any SQLite sidecars to uniquely named rollback files. Never overwrite an existing rollback file.

```sh
sudo mv -- "$DATA_DIR/zoomigo.db" "$ROLLBACK_DB"
if [ -e "$DATA_DIR/zoomigo.db-wal" ]; then
  sudo mv -- "$DATA_DIR/zoomigo.db-wal" "$ROLLBACK_DB-wal"
fi
if [ -e "$DATA_DIR/zoomigo.db-shm" ]; then
  sudo mv -- "$DATA_DIR/zoomigo.db-shm" "$ROLLBACK_DB-shm"
fi
sudo install -m 0600 -o 65532 -g 65532 "$RESTORED_DB" "$DATA_DIR/zoomigo.db"
```

Start the API and proxy:

```sh
docker compose --env-file .env -f compose.yaml up -d --wait --no-build api caddy
curl --fail https://api.example.com/readyz
curl -i https://api.example.com/v1/me/training-entries
```

Readiness must succeed and the unauthenticated private request must return `401`. Complete an approved test login and private read. Record the end time and observed recovery duration.

## 4. Immediate rollback if verification fails

Keep traffic stopped while rolling back:

```sh
docker compose --env-file .env -f compose.yaml stop caddy api
sudo mv -- "$DATA_DIR/zoomigo.db" "$RESTORE_DIR/failed-cutover-YYYYMMDDTHHMMSSZ.db"
sudo mv -- "$ROLLBACK_DB" "$DATA_DIR/zoomigo.db"
if [ -e "$ROLLBACK_DB-wal" ]; then
  sudo mv -- "$ROLLBACK_DB-wal" "$DATA_DIR/zoomigo.db-wal"
fi
if [ -e "$ROLLBACK_DB-shm" ]; then
  sudo mv -- "$ROLLBACK_DB-shm" "$DATA_DIR/zoomigo.db-shm"
fi
sudo chown 65532:65532 "$DATA_DIR/zoomigo.db" "$DATA_DIR"/zoomigo.db-* 2>/dev/null || true
docker compose --env-file .env -f compose.yaml up -d --wait --no-build api caddy
```

Recheck readiness, the private-route `401`, and an approved private read. Preserve the failed restored database and logs for investigation; do not retry blindly.

## 5. Close the recovery window

- Remove the age identity from `RESTORE_DIR` immediately after the drill or cutover. The long-term identity must remain with its custodian, off the VM.
- Keep the pre-restore database for the approved rollback period only. The recommended initial period is 24 hours after successful application verification.
- Reapply any verified deletion requests that occurred after the restored backup timestamp.
- Run `sudo ./scripts/production-check.sh .env --check-s3`.
- Record archive timestamp, application version, operators, start/end times, validation outcome, and whether rollback was used. Do not record PINs, QR URLs, session tokens, private keys, or child-level data.
